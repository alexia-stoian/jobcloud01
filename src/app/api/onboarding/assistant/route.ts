import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { invokeCareerGuideAgent, deriveCareerGuideSessionId } from "@/lib/ai/agentcore";
import { runInferenceSafely } from "@/lib/ai/signals/hook";
import { store as storeArtifact, findByUserAndType, createVersion } from "@/lib/artifacts/dal";

/**
 * Career Guide free-form assistant chat.
 *
 * The assistant brain now lives entirely in the Amazon Bedrock AgentCore runtime
 * (see src/lib/ai/agentcore.ts) — this route simply forwards the user's message
 * to the deployed agent and returns its reply as `{ answer }`.
 *
 * Recruiter-signal inference still runs on each message (invisible; feeds
 * Admin > Profile) via `runInferenceSafely`, which never throws or leaks signal
 * vocabulary into the user-facing reply.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  locale: z.enum(["en", "de", "fr"]).optional()
});

const FALLBACK_REPLY =
  "Sorry, I could not reach the Career Guide assistant just now. Please try again in a moment.";

/**
 * CandidateProfile string columns the agent may set directly (when it emits keys
 * that already match the schema). An allowlist prevents writing arbitrary columns.
 */
const DIRECT_PROFILE_FIELDS = new Set([
  "fullName",
  "currentJobSituation",
  "employmentObjective",
  "primaryRole",
  "preferredLocation",
  "targetRoles",
  "targetSeniority",
  "targetIndustries",
  "preferredWorkModel",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation",
  "workAuthorization",
  "visaSponsorship",
  "relocationWillingness",
  "commuteRadius"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Coerce a value to a trimmed non-empty string, or null. */
function toStr(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Coerce a value to an integer, or null. */
function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
}

/** Coerce a value to an array of trimmed non-empty strings. */
function toStrArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

/**
 * Map the agent's `profile` object onto CandidateProfile columns. Translates the
 * legacy ad-hoc keys (`target_role`, `job_sector`, `location`) and passes through
 * any key already named like a schema field.
 */
function mapAgentProfile(profile: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};

  const targetRole = toStr(profile.target_role);
  if (targetRole) {
    data.primaryRole = targetRole;
    data.targetRoles = targetRole;
  }
  const sector = toStr(profile.job_sector);
  if (sector) {
    data.targetIndustries = sector;
  }
  const location = toStr(profile.preferred_location) ?? toStr(profile.location);
  if (location) {
    data.preferredLocation = location;
  }

  for (const [key, value] of Object.entries(profile)) {
    if (DIRECT_PROFILE_FIELDS.has(key)) {
      const str = toStr(value);
      if (str) {
        data[key] = str;
      }
    }
  }

  return data;
}

/**
 * Merge the agent's role-based `preferences` block into the existing
 * `sectorPreferences` JSON (shape: `{ sector, generatedForRole, fields: [{ key,
 * label, value, options }] }`). Fields are merged by `key`. Returns null when
 * there is nothing usable to persist.
 */
function mergeSectorPreferences(
  existing: unknown,
  preferences: Record<string, unknown>
): Record<string, unknown> | null {
  const rawFields = Array.isArray(preferences.fields) ? preferences.fields : [];
  const incoming = rawFields
    .map((field) => {
      if (!isObject(field)) {
        return null;
      }
      const key = toStr(field.key);
      if (!key) {
        return null;
      }
      const options = Array.isArray(field.options)
        ? (field.options as unknown[]).map(toStr).filter((o): o is string => Boolean(o))
        : [];
      return { key, label: toStr(field.label) ?? key, value: toStr(field.value) ?? "", options };
    })
    .filter((f): f is { key: string; label: string; value: string; options: string[] } => f !== null);

  if (incoming.length === 0) {
    return null;
  }

  const role = toStr(preferences.role) ?? toStr(preferences.target_role) ?? toStr(preferences.generatedForRole);
  const base = isObject(existing) ? existing : {};
  const byKey = new Map<string, Record<string, unknown>>();
  if (Array.isArray(base.fields)) {
    for (const field of base.fields) {
      const key = isObject(field) ? toStr(field.key) : null;
      if (key) {
        byKey.set(key, field as Record<string, unknown>);
      }
    }
  }
  for (const field of incoming) {
    byKey.set(field.key, { ...(byKey.get(field.key) ?? {}), ...field });
  }

  return {
    ...base,
    sector: toStr(base.sector) ?? role ?? null,
    generatedForRole: role ?? toStr(base.generatedForRole) ?? null,
    fields: Array.from(byKey.values())
  };
}

/**
 * Convert the agent's `qualifications` block (from CV parsing) into
 * ProfileQualification rows. Skills stay plain strings; languages / experience /
 * education / certifications are stored as JSON blobs (matching the reader in
 * src/lib/sourcing/aggregate.ts and the CV extractor).
 */
function buildQualificationRows(quals: Record<string, unknown>): Array<{ category: string; value: string }> {
  const rows: Array<{ category: string; value: string }> = [];
  const push = (arr: unknown, category: string): void => {
    if (!Array.isArray(arr)) {
      return;
    }
    for (const item of arr) {
      if (typeof item === "string") {
        const value = item.trim();
        if (value) {
          rows.push({ category, value });
        }
      } else if (isObject(item)) {
        rows.push({ category, value: JSON.stringify(item) });
      }
    }
  };
  push(quals.skills, "skill");
  push(quals.languages, "language");
  push(quals.experience, "experience");
  push(quals.education, "diploma");
  push(quals.certifications, "certification");
  return rows;
}

/**
 * Persist everything the agent collected — standard profile fields, role-based
 * Preferences, and CV-derived qualifications — to the signed-in user's profile.
 * Best-effort: never throws into the request handler.
 */
async function persistAgentData(userId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const profile = isObject(data.profile) ? data.profile : {};
    const preferences = isObject(data.preferences) ? data.preferences : null;
    const qualifications = isObject(data.qualifications) ? data.qualifications : null;

    const scalar = mapAgentProfile(profile);
    if (Object.keys(scalar).length === 0 && !preferences && !qualifications) {
      return;
    }

    const existing = await db.candidateProfile.findUnique({
      where: { userId },
      select: { id: true, sectorPreferences: true }
    });
    if (!existing) {
      return;
    }

    const updateData: Record<string, unknown> = { ...scalar };
    if (preferences) {
      const merged = mergeSectorPreferences(existing.sectorPreferences, preferences);
      if (merged) {
        updateData.sectorPreferences = merged;
      }
    }
    if (Object.keys(updateData).length > 0) {
      await db.candidateProfile.update({ where: { userId }, data: updateData });
    }

    if (qualifications) {
      const rows = buildQualificationRows(qualifications);
      if (rows.length > 0) {
        await db.$transaction([
          db.profileQualification.deleteMany({ where: { profileId: existing.id } }),
          db.profileQualification.createMany({
            data: rows.map((row) => ({ ...row, profileId: existing.id }))
          })
        ]);
      }
    }
  } catch (error) {
    console.error(
      "[career-guide] profile persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Persist a cover letter the agent produced (`data.cover_letter`) as a
 * StoredArtifact. `action: "revise"` versions the user's most recent letter;
 * anything else stores a new one. Best-effort: never throws into the handler.
 */
async function persistCoverLetter(userId: string, coverLetter: Record<string, unknown>): Promise<void> {
  try {
    const content = toStr(coverLetter.content);
    if (!content) {
      return;
    }
    const action = toStr(coverLetter.action) ?? "create";

    if (action === "revise") {
      const [latest] = await findByUserAndType(userId, "cover_letter");
      if (latest) {
        await createVersion(latest.id, content);
        return;
      }
    }

    const metadata: Record<string, unknown> = {};
    const company = toStr(coverLetter.company);
    const jobTitle = toStr(coverLetter.jobTitle);
    const jobUrl = toStr(coverLetter.jobUrl);
    const language = toStr(coverLetter.language);
    const tone = toStr(coverLetter.tone);
    const wordCount = toInt(coverLetter.wordCount);
    const emphasis = toStrArray(coverLetter.emphasis);
    if (company) metadata.company = company;
    if (jobTitle) metadata.jobTitle = jobTitle;
    if (jobUrl) metadata.jobUrl = jobUrl;
    if (language) metadata.language = language;
    if (tone) metadata.tone = tone;
    if (wordCount !== null) metadata.wordCount = wordCount;
    if (emphasis.length > 0) metadata.emphasis = emphasis;

    await storeArtifact(userId, "cover_letter", content, metadata);
  } catch (error) {
    console.error(
      "[career-guide] cover letter persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Persist an interview turn the agent emitted (`data.interview`) to
 * InterviewSession / InterviewQuestion. The `action` drives the lifecycle:
 * start → question → feedback → complete. A single active (not-yet-ended)
 * session per user is tracked; question/feedback/complete auto-open one if the
 * agent skipped "start". Best-effort: never throws into the handler.
 */
async function persistInterview(userId: string, interview: Record<string, unknown>): Promise<void> {
  try {
    const action = toStr(interview.action);
    if (!action) {
      return;
    }

    const openSession = async () =>
      db.interviewSession.create({
        data: {
          userId,
          interviewType: toStr(interview.interviewType) ?? "behavioral",
          targetRole: toStr(interview.targetRole),
          locale: toStr(interview.language) ?? "en"
        }
      });

    if (action === "start") {
      await openSession();
      return;
    }

    let activeSession = await db.interviewSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!activeSession) {
      activeSession = await openSession();
    }

    if (action === "question") {
      const questionNum = toInt(interview.questionNum);
      const question = toStr(interview.question);
      if (questionNum !== null && question) {
        await db.interviewQuestion.upsert({
          where: { sessionId_questionNum: { sessionId: activeSession.id, questionNum } },
          create: { sessionId: activeSession.id, questionNum, question },
          update: { question }
        });
      }
      return;
    }

    if (action === "feedback") {
      const questionNum = toInt(interview.questionNum);
      if (questionNum !== null) {
        await db.interviewQuestion.upsert({
          where: { sessionId_questionNum: { sessionId: activeSession.id, questionNum } },
          create: {
            sessionId: activeSession.id,
            questionNum,
            question: toStr(interview.question) ?? "",
            userAnswer: toStr(interview.userAnswer),
            feedback: toStr(interview.feedback),
            score: toInt(interview.score)
          },
          update: {
            userAnswer: toStr(interview.userAnswer),
            feedback: toStr(interview.feedback),
            score: toInt(interview.score)
          }
        });
      }
      return;
    }

    if (action === "complete") {
      await db.interviewSession.update({
        where: { id: activeSession.id },
        data: {
          endedAt: new Date(),
          overallScore: toInt(interview.overallScore),
          strengths: toStrArray(interview.strengths),
          improvements: toStrArray(interview.improvements),
          recommendations: toStrArray(interview.recommendations)
        }
      });
    }
  } catch (error) {
    console.error(
      "[career-guide] interview persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { message } = parsed.data;

  // The agent owns the conversation; one persistent session per user.
  const sessionId = deriveCareerGuideSessionId(userId);
  const reply = await invokeCareerGuideAgent({ prompt: message, sessionId });

  // Persist everything the agent collected (standard fields, role-based
  // Preferences, CV qualifications) onto the user's profile. Best-effort.
  if (reply?.data && Object.keys(reply.data).length > 0) {
    await persistAgentData(userId, reply.data);
    if (isObject(reply.data.cover_letter)) {
      await persistCoverLetter(userId, reply.data.cover_letter);
    }
    if (isObject(reply.data.interview)) {
      await persistInterview(userId, reply.data.interview);
    }
  }

  // Keep recruiter-signal inference live (invisible; feeds Admin > Profile).
  // Awaited so state persists, but it can never throw or block the reply.
  await runInferenceSafely({
    userId,
    newInput: message.slice(0, 6000),
    source: "message",
    sessionId: null
  });

  return NextResponse.json({
    answer: reply?.text ?? FALLBACK_REPLY,
    options: reply?.options ?? [],
    openField: reply?.openField ?? true
  });
}
