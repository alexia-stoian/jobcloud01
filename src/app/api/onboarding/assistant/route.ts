import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import {
  invokeCareerGuideAgent,
  deriveCareerGuideSessionId,
  invokeApplicationCoachAgent,
  deriveApplicationCoachSessionId
} from "@/lib/ai/agentcore";
import { detectActiveAgent } from "@/lib/ai/agent-router";
import { persistCoverLetter, persistInterview } from "@/lib/ai/application-coach-persistence";
import { buildCandidateContext } from "@/lib/profile/agent-context";
import { runInferenceSafely } from "@/lib/ai/signals/hook";

/**
 * Career Guide free-form assistant chat.
 *
 * The assistant brain now lives entirely in the Amazon Bedrock AgentCore runtime
 * (see src/lib/ai/agentcore.ts) — this route forwards the user's message to the
 * deployed agent and returns its reply as `{ answer, options, openField }`.
 *
 * Two agents share this one chat: the Career Guide (default) and the Application
 * Coach (cover letters + interview practice). Routing is sticky and keyword-based
 * (see src/lib/ai/agent-router.ts) until the agents own the handoff themselves.
 * The active agent is carried by the client and echoed back on each reply.
 *
 * Recruiter-signal inference still runs on each message (invisible; feeds
 * Admin > Profile) via `runInferenceSafely`, which never throws or leaks signal
 * vocabulary into the user-facing reply.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  locale: z.enum(["en", "de", "fr"]).optional(),
  activeAgent: z.enum(["career_guide", "application_coach"]).optional()
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

/**
 * Short-label columns (job titles, enums). Reject sentence-like values so the
 * agent can't corrupt e.g. `primaryRole` with a value proposition or summary.
 */
const SHORT_LABEL_FIELDS = new Set([
  "primaryRole",
  "targetRoles",
  "targetSeniority",
  "preferredWorkModel",
  "contractPreference",
  "workRate",
  "currentJobSituation",
  "relocationWillingness"
]);

/** True when a string reads like a short label rather than a sentence. */
function looksLikeLabel(value: string): boolean {
  return value.length <= 80 && !value.includes("—") && !/\.\s/.test(value);
}

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

/**
 * Map the agent's `profile` object onto CandidateProfile columns. Translates the
 * legacy ad-hoc keys (`target_role`, `job_sector`, `location`) and passes through
 * any key already named like a schema field.
 */
function mapAgentProfile(profile: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};

  const targetRole = toStr(profile.target_role);
  if (targetRole && looksLikeLabel(targetRole)) {
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
      // Reject sentence-like values for short-label columns (anti-corruption).
      if (str && (!SHORT_LABEL_FIELDS.has(key) || looksLikeLabel(str))) {
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
 * Extract the draft-only profile fields (Professional headline, Value
 * proposition) from the agent's payload. These have no CandidateProfile column —
 * they live in `editorDraft` — so they need separate handling from `mapAgentProfile`.
 */
function extractDraftFields(
  profile: Record<string, unknown>,
  data: Record<string, unknown>
): { profileHeadline?: string; valueProposition?: string } {
  const out: { profileHeadline?: string; valueProposition?: string } = {};
  const headline =
    toStr(profile.profileHeadline) ??
    toStr(profile.headline) ??
    toStr(profile.professional_headline) ??
    toStr(data.headline);
  if (headline) {
    out.profileHeadline = headline;
  }
  const valueProp =
    toStr(profile.valueProposition) ??
    toStr(profile.value_proposition) ??
    toStr(profile.valueProp) ??
    toStr(data.value_proposition);
  if (valueProp) {
    out.valueProposition = valueProp;
  }
  return out;
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
    const draftFields = extractDraftFields(profile, data);
    const hasDraftFields = Object.keys(draftFields).length > 0;
    if (Object.keys(scalar).length === 0 && !hasDraftFields && !preferences && !qualifications) {
      return;
    }

    const existing = await db.candidateProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        sectorPreferences: true,
        editorDraft: true,
        primaryRole: true,
        targetRoles: true,
        targetSeniority: true
      }
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
    // Write the Professional headline / Value proposition into editorDraft (they
    // have no column). Prefer the agent's structured values; otherwise derive
    // them from the profile so the Profile fields don't stay empty. Stamp
    // _savedAt so ProfileSummaryCard's freshness reconciliation keeps them.
    const currentDraft = isObject(existing.editorDraft) ? existing.editorDraft : {};
    const haveHeadline = Boolean(draftFields.profileHeadline || toStr(currentDraft.profileHeadline));
    const haveValueProp = Boolean(draftFields.valueProposition || toStr(currentDraft.valueProposition));
    // Use a clean, label-like role for derivation (guard against a corrupted
    // primaryRole leaking into the headline / value proposition).
    const rawRole = toStr(scalar.primaryRole) ?? toStr(existing.primaryRole);
    const role =
      rawRole && looksLikeLabel(rawRole)
        ? rawRole
        : (toStr(existing.targetRoles)?.split(",")[0]?.trim() ?? null);
    if (role && (!haveHeadline || !haveValueProp)) {
      const skillRows = Array.isArray(currentDraft.skillRows) ? currentDraft.skillRows : [];
      const topSkills = skillRows
        .map((r) => (isObject(r) ? toStr(r.skill) : null))
        .filter((s): s is string => Boolean(s))
        .slice(0, 4);
      const expRows = Array.isArray(currentDraft.workExperienceRows) ? currentDraft.workExperienceRows : [];
      const latest = expRows.find((r) => isObject(r) && toStr(r.company));
      const company = isObject(latest) ? toStr(latest.company) : null;
      const seniority = toStr(scalar.targetSeniority) ?? toStr(existing.targetSeniority);
      if (!haveHeadline) {
        draftFields.profileHeadline = [role, ...topSkills.slice(0, 3)].join(" · ");
      }
      if (!haveValueProp) {
        const seniorityLabels: Record<string, string> = {
          junior: "Junior",
          mid: "Mid-level",
          "mid-level": "Mid-level",
          senior: "Senior",
          lead: "Lead",
          principal: "Principal"
        };
        const senPrefix = seniority
          ? `${seniorityLabels[seniority.toLowerCase()] ?? `${seniority.charAt(0).toUpperCase()}${seniority.slice(1)}`} `
          : "";
        draftFields.valueProposition =
          `${senPrefix}${role}` +
          `${company ? ` with experience at ${company}` : ""}` +
          `${topSkills.length > 0 ? `, skilled in ${topSkills.join(", ")}` : ""}.`;
      }
    }
    if (Object.keys(draftFields).length > 0) {
      updateData.editorDraft = {
        ...currentDraft,
        ...draftFields,
        _savedAt: new Date().toISOString()
      };
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

  // Route this turn to the right agent (sticky, keyword-based). The client
  // carries the previously-active agent so follow-up turns stay with whoever is
  // leading (e.g. cover-letter refinements keep reaching the Application Coach).
  const activeAgent = detectActiveAgent(message, parsed.data.activeAgent ?? "career_guide");

  if (activeAgent === "application_coach") {
    const sessionId = deriveApplicationCoachSessionId(userId);

    // Ground the Application Coach in THIS user's profile so cover letters and
    // interview practice are personalized. Loaded by userId → never shared
    // across accounts. Prepended as reference context to every coach turn.
    const context = await buildCandidateContext(userId);
    const prompt = context
      ? `[CANDIDATE PROFILE — personalize the cover letter / interview to this candidate. Use only these facts; do not invent employers, dates, or achievements. When you write a cover letter, include the full letter text in your message reply to the user, not only in a separate field.]\n${context}\n\n---\nUser message: ${message}`
      : message;

    const reply = await invokeApplicationCoachAgent({ prompt, sessionId });

    // Persist any cover letter / interview data the agent produced. Best-effort.
    if (reply?.data && Object.keys(reply.data).length > 0) {
      if (isObject(reply.data.cover_letter)) {
        await persistCoverLetter(userId, reply.data.cover_letter);
      }
      if (isObject(reply.data.interview)) {
        await persistInterview(userId, reply.data.interview);
      }
    }

    await runInferenceSafely({
      userId,
      newInput: message.slice(0, 6000),
      source: "message",
      sessionId: null
    });

    // Surface the full cover letter IN the chat message. The agent returns the
    // letter body in `cover_letter.content` (a separate field) while `message`
    // is only a short lead-in — so append the letter unless it's already there.
    let answer = reply?.text ?? FALLBACK_REPLY;
    const coverLetter = reply?.data?.cover_letter;
    if (isObject(coverLetter)) {
      const content = typeof coverLetter.content === "string" ? coverLetter.content.trim() : "";
      if (content && !answer.includes(content)) {
        answer = `${answer}\n\n${content}`;
      }
    }

    return NextResponse.json({
      answer,
      options: reply?.options ?? [],
      openField: reply?.openField ?? true,
      activeAgent
    });
  }

  // Career Guide (default). One persistent session per user.
  const sessionId = deriveCareerGuideSessionId(userId);

  // Give the Career Guide visibility of the saved profile so it can SEE the
  // current fields (including Professional headline and Value proposition) and
  // update them, instead of re-asking for details already on file. Loaded by
  // userId → never shared across accounts.
  const profileContext = await buildCandidateContext(userId);
  const careerGuidePrompt = profileContext
    ? `[CURRENT PROFILE — the candidate's saved profile. Reference these fields and feel free to refine any of them, including the Professional headline and Value proposition. Don't re-ask for information already present here. When you set or change the headline or value proposition, return them in your structured response as profile.profileHeadline and profile.valueProposition (the exact text). Keep profile.primaryRole a short job title only — never put a summary or sentence in it.]\n${profileContext}\n\n---\nUser message: ${message}`
    : message;
  const reply = await invokeCareerGuideAgent({ prompt: careerGuidePrompt, sessionId });

  // Persist everything the agent collected (standard fields, role-based
  // Preferences, CV qualifications) onto the user's profile. Best-effort.
  if (reply?.data && Object.keys(reply.data).length > 0) {
    await persistAgentData(userId, reply.data);
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
    openField: reply?.openField ?? true,
    activeAgent
  });
}
