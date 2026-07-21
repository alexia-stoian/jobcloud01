// Import the env shim FIRST so importing the auth/route modules does not trigger
// Zod validation of unrelated server env vars at module load.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test",
    DATABASE_URL: "postgres://test",
    AUTH_SECRET: "test-secret"
  }
}));

const authMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  candidateProfile: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

import { GET, POST } from "@/app/api/onboarding/sector-questions/route";
import { canConfirmOnboardingField } from "@/lib/onboarding/confirm-policy";
import { NextRequest } from "next/server";

const OWNER = "user-1";

type StoredField = {
  key: string;
  label: string;
  question: string;
  options: Array<{ value: string; label: string }>;
  value: string;
};

function makeSectorPreferences(fieldOverrides?: Partial<StoredField>[]): {
  sector: string;
  generatedLocale: string;
  generatedForRole: string;
  fields: StoredField[];
} {
  const defaults: StoredField[] = [
    {
      key: "teaching_level",
      label: "Teaching level",
      question: "Which level do you love teaching? 🍎",
      options: [
        { value: "primary", label: "Primary school 🎒" },
        { value: "secondary", label: "High school 📚" },
        { value: "higher", label: "University 🎓" }
      ],
      value: ""
    },
    {
      key: "subject_area",
      label: "Subject area",
      question: "What is your favourite subject to teach? 🎨",
      options: [
        { value: "math", label: "Maths ➗" },
        { value: "languages", label: "Languages 🗣️" }
      ],
      value: ""
    },
    {
      key: "class_size",
      label: "Class size",
      question: "What class size feels best? 👩‍🏫",
      options: [
        { value: "small", label: "Small groups" },
        { value: "large", label: "Large classes" }
      ],
      value: ""
    }
  ];
  const merged = defaults.map((field, index) => ({ ...field, ...(fieldOverrides?.[index] ?? {}) }));
  return { sector: "education", generatedLocale: "en", generatedForRole: "Teacher", fields: merged };
}

let profileRow: { sectorPreferences: unknown } | null;

function getReq(locale = "en"): NextRequest {
  return new NextRequest(`http://localhost/api/onboarding/sector-questions?locale=${locale}`);
}

function postReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/sector-questions", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

describe("sector-questions delivery endpoint (Phase 12 sector mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: OWNER } });
    profileRow = { sectorPreferences: makeSectorPreferences() };

    dbMock.candidateProfile.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) => {
      if (where.userId !== OWNER) {
        return null;
      }
      return profileRow;
    });
    dbMock.candidateProfile.update.mockImplementation(async ({ where, data }: { where: { userId: string }; data: { sectorPreferences: unknown } }) => {
      if (where.userId !== OWNER) {
        throw new Error("owner mismatch");
      }
      profileRow = { sectorPreferences: data.sectorPreferences };
      return profileRow;
    });
  });

  test("GET returns 401 without a session (owner scope)", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  test("GET returns done when the profile has no sector store (engineer/default {})", async () => {
    profileRow = { sectorPreferences: {} };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual({ done: true });
  });

  test("GET serves the FIRST unanswered field as an MCQ with allowCustom and the sector: prefix", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.done).toBe(false);
    expect(body.question.id).toBe("teaching_level");
    expect(body.question.field).toBe("sector:teaching_level");
    expect(body.question.allowCustom).toBe(true);
    expect(body.question.prompt).toContain("teaching");
    expect(body.question.options).toHaveLength(3);
    expect(body.answered).toEqual([]);
  });

  test("GET serves the next unanswered field and keeps answered ones in the transcript", async () => {
    profileRow = {
      sectorPreferences: makeSectorPreferences([{ value: "secondary" }])
    };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.question.id).toBe("subject_area");
    // Answered field renders the chosen option LABEL, not the raw slug value.
    expect(body.answered).toEqual([{ prompt: "Which level do you love teaching? 🍎", answerText: "High school 📚" }]);
  });

  test("GET caps delivery at 3 fields — a 4th persisted field is never served", async () => {
    const prefs = makeSectorPreferences([{ value: "secondary" }, { value: "math" }, { value: "small" }]);
    (prefs.fields as StoredField[]).push({
      key: "overflow",
      label: "Overflow",
      question: "Never asked?",
      options: [{ value: "x", label: "X" }],
      value: ""
    });
    profileRow = { sectorPreferences: prefs };
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.done).toBe(true);
    expect(body.answered).toHaveLength(3);
  });

  test("POST persists a chosen option into sectorPreferences.fields[key].value (never a profile column)", async () => {
    const res = await POST(postReq({ questionId: "teaching_level", chosenValue: "secondary", locale: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.done).toBe(false);

    const updateArgs = dbMock.candidateProfile.update.mock.calls[0][0];
    // Only sectorPreferences is written — no fixed column key is present.
    expect(Object.keys(updateArgs.data)).toEqual(["sectorPreferences"]);
    const written = updateArgs.data.sectorPreferences as ReturnType<typeof makeSectorPreferences>;
    expect(written.fields[0].value).toBe("secondary");
    expect(written.fields[1].value).toBe("");
    // Metadata is preserved.
    expect(written.sector).toBe("education");
    expect(written.generatedForRole).toBe("Teacher");
  });

  test("POST accepts a type-your-own free-text answer and stores it", async () => {
    const res = await POST(postReq({ questionId: "teaching_level", freeText: "Adult education", locale: "en" }));
    expect(res.status).toBe(200);
    const written = dbMock.candidateProfile.update.mock.calls[0][0].data.sectorPreferences as ReturnType<typeof makeSectorPreferences>;
    expect(written.fields[0].value).toBe("Adult education");
  });

  test("POST rejects when BOTH chosenValue and freeText are present (XOR)", async () => {
    const res = await POST(postReq({ questionId: "teaching_level", chosenValue: "primary", freeText: "x" }));
    expect(res.status).toBe(400);
    expect(dbMock.candidateProfile.update).not.toHaveBeenCalled();
  });

  test("POST rejects when NEITHER chosenValue nor freeText is present (XOR)", async () => {
    const res = await POST(postReq({ questionId: "teaching_level" }));
    expect(res.status).toBe(400);
  });

  test("POST rejects a chosenValue that is not one of the field's options", async () => {
    const res = await POST(postReq({ questionId: "teaching_level", chosenValue: "not-an-option" }));
    expect(res.status).toBe(400);
    expect(dbMock.candidateProfile.update).not.toHaveBeenCalled();
  });

  test("POST clamps and strips control characters from free text before persisting", async () => {
    const noisy = "a\u0000b\tc\n" + "x".repeat(500);
    const res = await POST(postReq({ questionId: "teaching_level", freeText: noisy }));
    expect(res.status).toBe(200);
    const written = dbMock.candidateProfile.update.mock.calls[0][0].data.sectorPreferences as ReturnType<typeof makeSectorPreferences>;
    const stored = written.fields[0].value;
    expect(stored).not.toMatch(/[\u0000-\u001F]/);
    expect(stored.length).toBeLessThanOrEqual(400);
    expect(stored.startsWith("a b c")).toBe(true);
  });

  test("POST accepts the sector:-prefixed questionId echoed back by the client", async () => {
    const res = await POST(postReq({ questionId: "sector:teaching_level", chosenValue: "primary" }));
    expect(res.status).toBe(200);
    const written = dbMock.candidateProfile.update.mock.calls[0][0].data.sectorPreferences as ReturnType<typeof makeSectorPreferences>;
    expect(written.fields[0].value).toBe("primary");
  });

  test("POST returns done: true only when it was the last unanswered field", async () => {
    profileRow = {
      sectorPreferences: makeSectorPreferences([{ value: "secondary" }, { value: "math" }])
    };
    const res = await POST(postReq({ questionId: "class_size", chosenValue: "small" }));
    const body = await res.json();
    expect(body.done).toBe(true);
  });

  test("POST returns 401 without a session (owner scope)", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ questionId: "teaching_level", chosenValue: "primary" }));
    expect(res.status).toBe(401);
  });

  test("POST returns 404 when the target field key is absent from the owner's store", async () => {
    const res = await POST(postReq({ questionId: "does_not_exist", chosenValue: "primary" }));
    expect(res.status).toBe(404);
  });

  test("POST returns 404 when a foreign user's profile is not found (owner scope)", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "attacker" } });
    const res = await POST(postReq({ questionId: "teaching_level", chosenValue: "primary" }));
    expect(res.status).toBe(404);
  });

  test("confirm-policy accepts any sector: field and still rejects an unknown non-sector field", () => {
    expect(canConfirmOnboardingField("sector:teaching_level")).toBe(true);
    expect(canConfirmOnboardingField("sector:anything_generated")).toBe(true);
    expect(canConfirmOnboardingField("primaryRole")).toBe(true);
    expect(canConfirmOnboardingField("sourcing:q0")).toBe(false);
    expect(canConfirmOnboardingField("totallyUnknownField")).toBe(false);
  });
});
