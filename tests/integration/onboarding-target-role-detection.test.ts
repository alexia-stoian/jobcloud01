/**
 * Wave 0 RED scaffold for Phase 10 target-role detection.
 *
 * Mirrors the mock setup of `onboarding-assistant-cover-letter.test.ts` and encodes the
 * locked-decision behaviors (D-01..D-04) as the acceptance gate for Plan 2. Several
 * assertions here are EXPECTED to be RED in this plan — the assistant route still uses the
 * regex detector and does not yet append the localized acknowledgement. Plan 2 rewires the
 * route (LLM detector in the GLOBAL block + acknowledgement) and turns these green.
 *
 * Do NOT weaken these assertions to force green in Wave 1.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isJobDomainMessageMock = vi.hoisted(() => vi.fn());
const buildDurableProfileMemoryMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  candidateProfile: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  },
  onboardingSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test"
  }
}));

vi.mock("@/lib/ai/domain-guard", () => ({
  isJobDomainMessage: isJobDomainMessageMock,
  OFF_TOPIC_RESPONSE: "off-topic"
}));

vi.mock("@/lib/profile/memory", () => ({
  buildDurableProfileMemory: buildDurableProfileMemoryMock
}));

import { POST } from "@/app/api/onboarding/assistant/route";

type AnyObj = Record<string, unknown>;

/**
 * Discriminating fetch mock: the detector call carries a STRICT-JSON role-classification
 * system prompt; every other call is treated as the assistant answer generation. Configure
 * the role the "LLM detector" returns via `detectorRole`.
 */
function makeFetchMock(detectorRole: string | null) {
  return vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}") as {
      system?: string;
      messages?: Array<{ content: string }>;
    };
    const isDetectorCall = typeof body.system === "string" && body.system.includes("STRICT JSON");
    const text = isDetectorCall
      ? JSON.stringify({ role: detectorRole })
      : "Here is a helpful assistant answer for you.";
    return Promise.resolve({
      ok: true,
      json: async () => ({ content: [{ type: "text", text }] })
    } as Response);
  });
}

function servicesState(currentMode?: "practice" | "mock"): AnyObj {
  return {
    currentPhase: "services",
    services: currentMode ? { interviewPrep: { currentMode } } : {}
  };
}

function baseProfile(overrides: AnyObj = {}): AnyObj {
  return {
    id: "profile-1",
    userId: "user-1",
    fullName: "Alex Candidate",
    locale: "en",
    primaryRole: "Software Engineer",
    targetRoles: "Software Engineer",
    preferredLocation: "Lausanne",
    salaryExpectation: "100000",
    workPermitStatus: "Eligible",
    currentJobSituation: "Open to opportunities",
    workRate: "100%",
    assistantState: servicesState(),
    qualifications: [{ category: "skill", value: "TypeScript" }],
    ...overrides
  };
}

function baseSession(overrides: AnyObj = {}): AnyObj {
  return {
    id: "session-1",
    userId: "user-1",
    profileId: "profile-1",
    locale: "en",
    targetRole: null,
    cvExtractedFacts: { skills: ["TypeScript"] },
    ...overrides
  };
}

async function post(message: string, locale: "en" | "de" | "fr" = "en"): Promise<Response> {
  return POST(
    new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message, locale })
    }) as never
  );
}

describe("onboarding assistant target-role detection (Wave 0 scaffold — RED until Plan 2)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    isJobDomainMessageMock.mockReturnValue(true);
    buildDurableProfileMemoryMock.mockReturnValue({
      profile: {
        employmentObjective: "Find a software engineering role",
        primaryRole: "Software Engineer",
        preferredLocation: "Lausanne",
        currentJobSituation: "Open to opportunities",
        contractPreference: "Full-time",
        workRate: "100%",
        workPermitStatus: "Eligible",
        salaryExpectation: "100000"
      },
      qualifications: [{ category: "skill", value: "TypeScript" }]
    });

    dbMock.candidateProfile.findUnique.mockImplementation(async () => baseProfile());
    dbMock.candidateProfile.update.mockImplementation(async () => baseProfile());
    dbMock.candidateProfile.create.mockImplementation(async () => baseProfile());
    dbMock.onboardingSession.findUnique.mockImplementation(async () => baseSession());
    dbMock.onboardingSession.update.mockImplementation(async ({ data }: { data: AnyObj }) =>
      baseSession(data)
    );
    dbMock.onboardingSession.create.mockImplementation(async () => baseSession());
  });

  // (a) explicit first-person intent → both updates called with the normalized role and the
  //     returned answer carries the localized (EN) acknowledgement.
  test("explicit first-person intent switches the role and acknowledges it", async () => {
    const fm = makeFetchMock("Product Manager");
    vi.stubGlobal("fetch", fm);

    const res = await post("I want to become a Product Manager");
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { answer?: string };

    expect(dbMock.onboardingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetRole: "Product Manager" }) })
    );
    expect(dbMock.candidateProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetRoles: "Product Manager" }) })
    );
    expect(payload.answer).toContain("Product Manager");
    expect(payload.answer?.toLowerCase()).toContain("optimize");
  });

  // (b) LLM returns null → no switch, no acknowledgement.
  test("no detected intent leaves the role unchanged and adds no acknowledgement", async () => {
    const fm = makeFetchMock(null);
    vi.stubGlobal("fetch", fm);

    const res = await post("Tell me about the weather in my industry");
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { answer?: string };

    expect(dbMock.onboardingSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetRole: expect.any(String) }) })
    );
    expect(payload.answer?.toLowerCase()).not.toContain("optimize everything for");
  });

  // (c) practice turn where the role is merely mentioned → detector returns null → no switch.
  test("practice turn with a merely-mentioned role does not switch", async () => {
    dbMock.candidateProfile.findUnique.mockImplementation(async () =>
      baseProfile({ assistantState: servicesState("practice") })
    );
    const fm = makeFetchMock(null);
    vi.stubGlobal("fetch", fm);

    const res = await post("In my last job I helped the team become a Product Manager's best ally");
    expect(res.status).toBe(200);

    expect(dbMock.onboardingSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetRole: expect.any(String) }) })
    );
  });

  // (d) DE and FR acknowledgements in the correct language.
  test("acknowledges the switch in German", async () => {
    const fm = makeFetchMock("Product Manager");
    vi.stubGlobal("fetch", fm);

    const res = await post("Ich möchte Product Manager werden", "de");
    const payload = (await res.json()) as { answer?: string };
    expect(payload.answer).toContain("Product Manager");
    expect(payload.answer?.toLowerCase()).toContain("optimiere");
  });

  test("acknowledges the switch in French", async () => {
    const fm = makeFetchMock("Product Manager");
    vi.stubGlobal("fetch", fm);

    const res = await post("Je veux devenir Product Manager", "fr");
    const payload = (await res.json()) as { answer?: string };
    expect(payload.answer).toContain("Product Manager");
    expect(payload.answer?.toLowerCase()).toContain("optimise");
  });

  // (e) detector fetch fails → no switch, request still returns 200.
  test("detector failure does not switch and the request still returns 200", async () => {
    const fm = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as { system?: string };
      if (typeof body.system === "string" && body.system.includes("STRICT JSON")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "assistant answer" }] })
      } as Response);
    });
    vi.stubGlobal("fetch", fm);

    const res = await post("I want to become a Data Analyst");
    expect(res.status).toBe(200);
    expect(dbMock.onboardingSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetRole: "Data Analyst" }) })
    );
  });
});
