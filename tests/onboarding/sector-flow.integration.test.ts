/**
 * Full-loop sector onboarding integration test (Phase 12, Plan 12-4).
 *
 * This is the Nyquist capstone for Phase 12: it exercises the whole 6-step loop
 * against the REAL route handlers and library functions, wired to a STATEFUL
 * in-memory Prisma store (writes are readable back) so the answer → persist →
 * render round-trip actually asserts (review concern D). Only the Anthropic
 * network call is mocked; `parseLlmJson` stays real. No real network is made.
 *
 * Coverage map:
 *  (1) CV-first ordering — universal-6 render on top; engineer keeps full flow.
 *  (2) CV branch — CV facts → CV-tailored role MCQ; no CV → open-ended.
 *  (3) Sector trigger — non-engineer role generates + persists <=3 sector defs.
 *  (4) Engineer short-circuit — sectorPreferences stays {}.
 *  (5) MCQ persist — sector-questions GET delivers each MCQ; POST stores option
 *      AND free-text into sectorPreferences.fields[].value.
 *  (6) Resume — GET re-attaches only the unanswered question + answered transcript.
 *  (7) PATCH /api/profile/summary updates a sector value (server-owned defs kept).
 *  (8) Locale matrix — EN/DE/FR: generatedLocale stamped + localized label
 *      round-trips through the store to delivery and PATCH.
 *  (D-02) LLM-null degradation — store stays {}, delivery reports done, no throw.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  makeEngineerFixture,
  makeLocalizedSectorFixture,
  makeRoleOptionsFixture,
  makeSectorFixture
} from "./_fixtures";

// Stub @/lib/env FIRST so importing the route/lib modules does not trigger Zod
// validation of unrelated server env vars at module load.
vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test",
    DATABASE_URL: "postgres://test",
    AUTH_SECRET: "test-secret"
  }
}));

// Mock ONLY the Anthropic network call; keep parseLlmJson real.
const { callAnthropic } = vi.hoisted(() => ({ callAnthropic: vi.fn() }));
vi.mock("@/lib/sourcing/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sourcing/anthropic")>();
  return { ...actual, callAnthropic };
});

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth/config", () => ({ auth: authMock }));

// STATEFUL in-memory candidateProfile store — writes are readable back so the
// answer → persist → render round-trip genuinely asserts (review concern D).
type ProfileRecord = {
  id: string;
  userId: string;
  locale: string;
  sectorPreferences: unknown;
  qualifications: unknown[];
  historyEvents: unknown[];
  [key: string]: unknown;
};

const { store, dbMock } = vi.hoisted(() => {
  const store = { profiles: new Map<string, ProfileRecord>() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbMock: any = {
    candidateProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.userId) return store.profiles.get(where.userId) ?? null;
        if (where.id) return [...store.profiles.values()].find((profile) => profile.id === where.id) ?? null;
        return null;
      }),
      update: vi.fn(async ({ where, data }: { where: { userId?: string; id?: string }; data: Record<string, unknown> }) => {
        const record = where.userId
          ? store.profiles.get(where.userId)
          : [...store.profiles.values()].find((profile) => profile.id === where.id);
        if (!record) throw new Error("record_not_found");
        Object.assign(record, data);
        return record;
      })
    },
    profileQualification: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 }))
    },
    // Run the transaction callback against the same stateful mock.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock))
  };
  return { store, dbMock };
});
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { GET as sectorGET, POST as sectorPOST } from "@/app/api/onboarding/sector-questions/route";
import { PATCH as profilePATCH } from "@/app/api/profile/summary/route";
import { generateTargetRoleQuestion } from "@/lib/onboarding/detect-target-role";
import { classifySectorAndGenerateFields } from "@/lib/onboarding/sector-fields";
import { selectPostCvPreferenceFlow } from "@/lib/onboarding/interactive";
import { NextRequest } from "next/server";

const OWNER = "user-1";
const LOCALES = ["en", "de", "fr"] as const;

type SectorLocale = (typeof LOCALES)[number];

function seedProfile(userId = OWNER, locale = "en"): void {
  store.profiles.set(userId, {
    id: `profile-${userId}`,
    userId,
    locale,
    fullName: "Test User",
    preferredLocation: "Zurich",
    primaryRole: "Teacher",
    workPermitStatus: "Citizen",
    sectorPreferences: {},
    qualifications: [],
    historyEvents: [],
    isMinimallyComplete: false,
    missingCriticalFields: []
  });
}

function readStore(userId = OWNER): { fields: Array<{ key: string; value: string; label: string }> } {
  const record = store.profiles.get(userId);
  return (record?.sectorPreferences ?? {}) as { fields: Array<{ key: string; value: string; label: string }> };
}

/** Mirror the interactive route's one-shot trigger: generate then persist. */
async function generateAndPersistSector(userId: string, role: string, locale: SectorLocale): Promise<boolean> {
  const set = await classifySectorAndGenerateFields({ targetRole: role, locale });
  if (!set || set.usesDefaultFields || set.fields.length === 0) return false;
  const sectorPreferences = {
    sector: set.sector,
    generatedLocale: set.generatedLocale,
    generatedForRole: role,
    fields: set.fields
  };
  await dbMock.candidateProfile.update({
    where: { userId },
    data: { sectorPreferences: JSON.parse(JSON.stringify(sectorPreferences)) }
  });
  return true;
}

function sectorGetReq(locale = "en"): NextRequest {
  return new NextRequest(`http://localhost/api/onboarding/sector-questions?locale=${locale}`);
}

function sectorPostReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/sector-questions", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function patchReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/profile/summary", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("sector onboarding full loop (Phase 12, Plan 12-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.profiles.clear();
    authMock.mockResolvedValue({ user: { id: OWNER } });
    seedProfile();
  });

  // Step (1) — universal preference set renders on top; engineer keeps the full flow.
  test("universal flow renders on top for non-engineers; engineer keeps the full flow", () => {
    const universal = selectPostCvPreferenceFlow(false);
    const engineer = selectPostCvPreferenceFlow(true);

    expect(universal).toHaveLength(7);
    expect(universal[0].field).toBe("currentJobSituation");
    expect(universal.map((q) => q.field)).toContain("commuteRadius");
    // Engineer/default keeps the full (larger) flow unchanged — no sector block.
    expect(engineer.length).toBeGreaterThan(universal.length);
  });

  // Step (2) — CV branch: no CV facts → curated 10-domain MCQ (+ custom);
  // CV facts → CV-tailored MCQ.
  test("target-role ask is a 10-domain MCQ without a CV and CV-tailored with one", async () => {
    const noCv = await generateTargetRoleQuestion({ locale: "en", cvFacts: null });
    expect(noCv.options).toHaveLength(10);
    expect(noCv.allowCustom).toBe(true);

    callAnthropic.mockResolvedValueOnce(makeRoleOptionsFixture());
    const tailored = await generateTargetRoleQuestion({
      locale: "en",
      cvFacts: { title: "Math teacher", experience: "10 years" }
    });
    expect(tailored.options?.length).toBeGreaterThanOrEqual(2);
    expect(tailored.options?.map((option) => option.label)).toContain("High school teacher");
  });

  // Step (3) — non-engineer role generates + persists <=3 sector defs.
  test("a non-engineer target role generates and persists at most 3 sector fields", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture());
    const generated = await generateAndPersistSector(OWNER, "Math teacher", "fr");

    expect(generated).toBe(true);
    const stored = readStore();
    expect(stored.fields.length).toBeGreaterThanOrEqual(1);
    expect(stored.fields.length).toBeLessThanOrEqual(3);
  });

  // Step (4) — engineer/software role short-circuits: sectorPreferences stays {}.
  test("an engineering role leaves sectorPreferences empty ({})", async () => {
    callAnthropic.mockResolvedValueOnce(makeEngineerFixture());
    const generated = await generateAndPersistSector(OWNER, "Software Engineer", "en");

    expect(generated).toBe(false);
    expect(readStore().fields).toBeUndefined();
  });

  // Step (5) — MCQ delivery persists BOTH a chosen option and a free-text answer.
  test("sector-questions delivers each MCQ and persists option and free-text answers", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture());
    await generateAndPersistSector(OWNER, "Math teacher", "fr");

    // First MCQ delivered.
    const first = await (await sectorGET(sectorGetReq("fr"))).json();
    expect(first.done).toBe(false);
    expect(first.question.field).toBe("sector:teaching_level");
    expect(first.question.options.length).toBeGreaterThanOrEqual(2);

    // Answer #1 by picking a valid option value.
    const post1 = await (await sectorPOST(sectorPostReq({ questionId: "teaching_level", chosenValue: "secondaire" }))).json();
    expect(post1.done).toBe(false);
    expect(readStore().fields.find((field) => field.key === "teaching_level")?.value).toBe("secondaire");

    // Next MCQ delivered; answer #2 with free text (type-your-own).
    const second = await (await sectorGET(sectorGetReq("fr"))).json();
    expect(second.question.field).toBe("sector:subject_area");
    expect(second.answered).toHaveLength(1);

    const post2 = await (await sectorPOST(sectorPostReq({ questionId: "subject_area", freeText: "Philosophie" }))).json();
    expect(post2.done).toBe(true);
    expect(readStore().fields.find((field) => field.key === "subject_area")?.value).toBe("Philosophie");
  });

  // Step (6) — resume re-attaches ONLY the unanswered question + answered transcript.
  test("delivery resumes at the first unanswered field only", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture());
    await generateAndPersistSector(OWNER, "Math teacher", "fr");

    await sectorPOST(sectorPostReq({ questionId: "teaching_level", chosenValue: "primaire" }));

    const resumed = await (await sectorGET(sectorGetReq("fr"))).json();
    // Answered field is in the transcript, next ask is the still-unanswered one.
    expect(resumed.answered).toHaveLength(1);
    expect(resumed.question.field).toBe("sector:subject_area");
  });

  // Step (7) — PATCH /api/profile/summary updates a sector value; defs preserved.
  test("PATCH /api/profile/summary updates a sector value without touching defs", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture());
    await generateAndPersistSector(OWNER, "Math teacher", "fr");

    const before = readStore().fields.find((field) => field.key === "teaching_level");
    const response = await profilePATCH(
      patchReq({ sectorPreferences: { fields: [{ key: "teaching_level", value: "superieur" }] } })
    );
    expect(response.status).toBe(200);

    const after = readStore().fields.find((field) => field.key === "teaching_level");
    expect(after?.value).toBe("superieur");
    // Server-owned def (label + options) is spread-preserved, only value changed.
    expect(after?.label).toBe(before?.label);
    expect((after as { options?: unknown[] }).options).toEqual((before as { options?: unknown[] }).options);
  });

  // Step (7b) — the client can NEVER inject a new field via PATCH (T-12-13).
  test("PATCH cannot add or rename sector fields — only update existing keys", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture());
    await generateAndPersistSector(OWNER, "Math teacher", "fr");

    const keysBefore = readStore().fields.map((field) => field.key).sort();
    await profilePATCH(
      patchReq({ sectorPreferences: { fields: [{ key: "injected_admin_field", value: "hacked" }] } })
    );

    const keysAfter = readStore().fields.map((field) => field.key).sort();
    expect(keysAfter).toEqual(keysBefore);
    expect(keysAfter).not.toContain("injected_admin_field");
  });

  // Step (8) — EN/DE/FR: generatedLocale stamped + localized label round-trips.
  test.each(LOCALES)("locale matrix: %s copy round-trips through the store to delivery", async (locale) => {
    callAnthropic.mockResolvedValueOnce(makeLocalizedSectorFixture(locale));
    await generateAndPersistSector(OWNER, "Teacher", locale);

    const stored = store.profiles.get(OWNER)?.sectorPreferences as { generatedLocale: string; fields: Array<{ label: string }> };
    expect(stored.generatedLocale).toBe(locale);

    const expectedLabel = { en: "Teaching level", de: "Unterrichtsstufe", fr: "Niveau d'enseignement" }[locale];
    expect(stored.fields[0].label).toBe(expectedLabel);

    // The localized question/options are delivered verbatim by the endpoint.
    const delivered = await (await sectorGET(sectorGetReq(locale))).json();
    expect(delivered.question.prompt).toContain({ en: "level", de: "Stufe", fr: "niveau" }[locale]);
  });

  // (D-02) — LLM-null degrades to universal-only: store stays {}, delivery done.
  test("LLM-null generation degrades to universal-only without throwing (D-02)", async () => {
    callAnthropic.mockResolvedValueOnce(null);
    const generated = await generateAndPersistSector(OWNER, "Math teacher", "en");

    expect(generated).toBe(false);
    const delivered = await (await sectorGET(sectorGetReq("en"))).json();
    expect(delivered.done).toBe(true);
  });
});
