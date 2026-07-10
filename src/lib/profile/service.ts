import { ActorType, ProfileMutationSource, type CandidateProfile } from "@prisma/client";
import { db } from "@/lib/db";
import type { ProfileChangeSetEntry, ProfileIntent } from "@/lib/profile/types";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { validateIntentWarnings } from "@/lib/profile/validation";

const PROFILE_FIELDS = [
  "fullName",
  "currentJobSituation",
  "employmentObjective",
  "primaryRole",
  "preferredLocation",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation"
] as const;

function isProfileField(value: string): value is (typeof PROFILE_FIELDS)[number] {
  return (PROFILE_FIELDS as readonly string[]).includes(value);
}

export async function applyConfirmedProfileMutation(input: {
  userId: string;
  intents: ProfileIntent[];
  confirmationRef: string;
}): Promise<{
  warnings: string[];
  completion: { isMinimallyComplete: boolean; missingCriticalFields: string[] };
}> {
  return db.$transaction(async (tx) => {
    const profile = await tx.candidateProfile.findUnique({
      where: { userId: input.userId }
    });

    if (!profile) {
      throw new Error("profile_not_found");
    }

    const profileUpdates: Partial<
      Pick<
        CandidateProfile,
        | "fullName"
        | "currentJobSituation"
        | "employmentObjective"
        | "primaryRole"
        | "preferredLocation"
        | "contractPreference"
        | "workRate"
        | "workPermitStatus"
        | "salaryExpectation"
      >
    > = {};
    const changeSet: ProfileChangeSetEntry[] = [];

    for (const intent of input.intents) {
      if (intent.operation === "set") {
        const previousValue = profile[intent.field] as string | null;
        profileUpdates[intent.field] = intent.value;
        changeSet.push({
          kind: "profile_field",
          field: intent.field,
          operation: intent.operation,
          value: intent.value,
          previousValue
        });
        continue;
      }

      if (intent.operation === "clear") {
        profileUpdates.salaryExpectation = null;
        changeSet.push({
          kind: "profile_field",
          field: "salaryExpectation",
          operation: "clear",
          value: null,
          previousValue: profile.salaryExpectation
        });
        continue;
      }

      if (intent.operation === "addItem") {
        const created = await tx.profileQualification.create({
          data: {
            profileId: profile.id,
            category: intent.category,
            value: intent.value
          }
        });
        changeSet.push({
          kind: "qualification_item",
          operation: "addItem",
          category: intent.category,
          value: created.value,
          previousValue: null
        });
        continue;
      }

      const existing = await tx.profileQualification.findFirst({
        where: {
          profileId: profile.id,
          category: intent.category,
          value: intent.value
        }
      });
      if (existing) {
        await tx.profileQualification.delete({ where: { id: existing.id } });
      }
      changeSet.push({
        kind: "qualification_item",
        operation: "removeItem",
        category: intent.category,
        value: intent.value,
        previousValue: existing?.value ?? null
      });
    }

    const updated = await tx.candidateProfile.update({
      where: { id: profile.id },
      data: profileUpdates
    });

    const completion = computeCompletion(updated);

    const finalProfile = await tx.candidateProfile.update({
      where: { id: updated.id },
      data: {
        isMinimallyComplete: completion.isMinimallyComplete,
        missingCriticalFields: completion.missingCriticalFields,
        lastCompletionCheckAt: new Date()
      }
    });

    await tx.profileHistoryEvent.create({
      data: {
        profileId: finalProfile.id,
        userId: input.userId,
        actorType: ActorType.USER,
        source: ProfileMutationSource.CHAT,
        confirmationRef: input.confirmationRef,
        changeSet: changeSet
      }
    });

    const warnings = validateIntentWarnings(finalProfile);
    return {
      warnings,
      completion
    };
  });
}

export async function revertLastProfileMutation(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const profile = await tx.candidateProfile.findUnique({
      where: { userId },
      include: {
        historyEvents: {
          where: { source: ProfileMutationSource.CHAT },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!profile || profile.historyEvents.length === 0) {
      return;
    }

    const last = profile.historyEvents[0];
    const changeSet = (last.changeSet ?? []) as ProfileChangeSetEntry[];
    const profileUpdates: Record<string, string | null> = {};

    for (const entry of [...changeSet].reverse()) {
      if (entry.kind === "profile_field" && entry.field && isProfileField(entry.field)) {
        profileUpdates[entry.field] = entry.previousValue ?? null;
        continue;
      }

      if (entry.kind === "qualification_item" && entry.category && entry.value) {
        if (entry.operation === "addItem") {
          const added = await tx.profileQualification.findFirst({
            where: {
              profileId: profile.id,
              category: entry.category,
              value: entry.value
            },
            orderBy: { createdAt: "desc" }
          });
          if (added) {
            await tx.profileQualification.delete({ where: { id: added.id } });
          }
        } else if (entry.operation === "removeItem" && entry.previousValue) {
          await tx.profileQualification.create({
            data: {
              profileId: profile.id,
              category: entry.category,
              value: entry.previousValue
            }
          });
        }
      }
    }

    const reverted = await tx.candidateProfile.update({
      where: { id: profile.id },
      data: profileUpdates
    });

    const completion = computeCompletion(reverted);
    await tx.candidateProfile.update({
      where: { id: profile.id },
      data: {
        isMinimallyComplete: completion.isMinimallyComplete,
        missingCriticalFields: completion.missingCriticalFields,
        lastCompletionCheckAt: new Date()
      }
    });

    await tx.profileHistoryEvent.create({
      data: {
        profileId: profile.id,
        userId,
        actorType: ActorType.SYSTEM,
        source: ProfileMutationSource.SYSTEM_REVERT,
        changeSet: {
          revertedEventId: last.id,
          revertedAt: new Date().toISOString()
        }
      }
    });
  });
}
