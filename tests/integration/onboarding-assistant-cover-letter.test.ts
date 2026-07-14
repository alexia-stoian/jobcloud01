import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isJobDomainMessageMock = vi.hoisted(() => vi.fn());
const buildDurableProfileMemoryMock = vi.hoisted(() => vi.fn());

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

function anthropicResponse(text: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      content: [{ type: "text", text }]
    })
  } as Response);
}

describe("onboarding assistant cover letter behavior", () => {
  let editorDraft: AnyObj;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    editorDraft = {};

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    isJobDomainMessageMock.mockReturnValue(true);
    buildDurableProfileMemoryMock.mockReturnValue({
      profile: {
        employmentObjective: "Find a software engineering role",
        primaryRole: "Software Engineer",
        preferredLocation: "Lausanne",
        currentJobSituation: "Student",
        contractPreference: "Full-time",
        workRate: "100%",
        workPermitStatus: "Eligible",
        salaryExpectation: "100000"
      },
      qualifications: [{ category: "skill", value: "TypeScript" }]
    });

    dbMock.candidateProfile.findUnique.mockImplementation(async () => ({
      id: "profile-1",
      userId: "user-1",
      fullName: "Alex Candidate",
      primaryRole: "Software Engineer",
      targetRoles: "Software Engineer,Data Analyst",
      preferredLocation: "Lausanne",
      salaryExpectation: "100000",
      workPermitStatus: "Eligible",
      currentJobSituation: "Open to opportunities",
      workRate: "100%",
      editorDraft,
      qualifications: [
        { category: "skill", value: "TypeScript" },
        { category: "project", value: "Built internal analytics dashboard" }
      ],
      onboardingSession: {
        cvFileName: "cv.pdf",
        cvExtractedFacts: {
          skills: ["TypeScript", "React"],
          experience: ["Software Engineer at Example Corp"],
          projects: ["Customer portal redesign"],
          education: ["BSc Computer Science"],
          certifications: ["AWS Cloud Practitioner"]
        }
      }
    }));

    dbMock.candidateProfile.update.mockImplementation(async ({ data }: { data: AnyObj }) => {
      editorDraft = (data.editorDraft as AnyObj) ?? editorDraft;
      return { id: "profile-1", editorDraft };
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  test("stores generated draft and returns cached last draft on follow-up request", async () => {
    fetchMock.mockImplementationOnce(() => anthropicResponse("FIRST DRAFT"));

    const first = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "write a cover letter for software engineer" })
    }) as never);

    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(typeof firstBody.answer).toBe("string");
    expect((firstBody.answer as string).length).toBeGreaterThan(40);
    expect((editorDraft.coverLetterCache as AnyObj)?.lastDraft).toBe(firstBody.answer);
    expect((editorDraft.coverLetterCache as AnyObj)?.generatorVersion).toBe("anthropic-v1");

    const second = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "cover letter" })
    }) as never);

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ answer: firstBody.answer });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("regenerates draft for specific role change from follow-up message", async () => {
    editorDraft = {
      coverLetterCache: {
        role: "Software Engineer",
        targetWords: 300,
        lastJobContext: "Platform role",
        lastDraft: "OLD DRAFT",
        generatedAt: new Date().toISOString(),
        generatorVersion: "anthropic-v1"
      }
    };

    fetchMock.mockImplementationOnce(() => anthropicResponse("ANALYST DRAFT"));

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "switch role to Data Analyst" })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.answer).toBe("string");
    expect((editorDraft.coverLetterCache as AnyObj)?.role).toContain("Data Analyst");
    expect((editorDraft.coverLetterCache as AnyObj)?.lastDraft).toBe(payload.answer);
  });

  test("supports numeric-only word count refinements for the cached draft", async () => {
    editorDraft = {
      coverLetterCache: {
        role: "Software Engineer",
        targetWords: 280,
        lastJobContext: "Engineering team",
        lastDraft: "OLD DRAFT",
        generatedAt: new Date().toISOString(),
        generatorVersion: "anthropic-v1"
      }
    };

    fetchMock.mockImplementationOnce(() => anthropicResponse("350 WORD DRAFT"));

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "350" })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.answer).toBe("string");
    expect((editorDraft.coverLetterCache as AnyObj)?.targetWords).toBe(350);
    expect((editorDraft.coverLetterCache as AnyObj)?.lastDraft).toBe(payload.answer);
  });

  test("expands the cached draft when the requested length increases", async () => {
    editorDraft = {
      coverLetterCache: {
        role: "Software Engineer",
        targetWords: 200,
        lastJobContext: "Engineering team",
        lastDraft: ("WORD ".repeat(200)).trim(),
        generatedAt: new Date().toISOString(),
        generatorVersion: "anthropic-v1"
      }
    };

    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "EXPANDED DRAFT" }]
      })
    }));

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "make it 300 words" })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.answer).toBe("string");
    expect((editorDraft.coverLetterCache as AnyObj)?.targetWords).toBe(300);

    const call = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestBody = JSON.parse((call?.body as string) ?? "{}") as Record<string, unknown>;
    const prompt = String((requestBody.messages as Array<{ content: string }>)?.[0]?.content ?? "");
    expect(prompt).toContain("Revision mode: expand");
    expect(prompt).toContain("300 words");
  });

  test("respects explicit 200-word refinement requests", async () => {
    editorDraft = {
      coverLetterCache: {
        role: "Software Engineer",
        targetWords: 450,
        lastJobContext: "Engineering team",
        lastDraft: "OLD DRAFT " + "word ".repeat(600),
        generatedAt: new Date().toISOString(),
        generatorVersion: "anthropic-v1"
      }
    };

    // Simulate model returning an overly long response; route should enforce numeric target.
    fetchMock.mockImplementationOnce(() => anthropicResponse(("LONG DRAFT " + "token ".repeat(700)).trim()));

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "make the cover letter just 200 words" })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    const wordCount = String(payload.answer).trim().split(/\s+/).filter(Boolean).length;
    expect((editorDraft.coverLetterCache as AnyObj)?.targetWords).toBe(200);
    expect(wordCount).toBeLessThanOrEqual(220);
  });

  test("supports shorter refinements and carries user focus keywords", async () => {
    editorDraft = {
      coverLetterCache: {
        role: "Software Engineer",
        targetWords: 360,
        lastJobContext: "Engineering team",
        lastDraft: ("WORD ".repeat(360)).trim(),
        generatedAt: new Date().toISOString(),
        generatorVersion: "anthropic-v1"
      }
    };

    fetchMock.mockImplementationOnce(() => anthropicResponse("REFINED DRAFT"));

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: "make it shorter and focus on distributed systems and mentoring" })
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.answer).toBe("string");
    expect((editorDraft.coverLetterCache as AnyObj)?.targetWords).toBeLessThan(360);

    const call = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestBody = JSON.parse((call?.body as string) ?? "{}") as Record<string, unknown>;
    const prompt = String((requestBody.messages as Array<{ content: string }>)?.[0]?.content ?? "");
    expect(prompt).toContain("Revision mode: summarize");
    expect(prompt).toContain("User focus keywords to emphasize");
    expect(prompt).toContain("distributed systems");
    expect(prompt).toContain("mentoring");
  });

  test("passes detailed job requirements to Anthropic for role-specific matching", async () => {
    fetchMock.mockImplementationOnce(() => anthropicResponse("CUSTOM DRAFT"));

    const posting = [
      "Write a cover letter for this role:",
      "Senior Product Analyst at Acme Labs",
      "Requirements:",
      "- 5+ years of experience in product analytics",
      "- Strong SQL and Tableau skills",
      "- Ability to partner with product and engineering teams",
      "Responsibilities:",
      "- Build KPI dashboards and run funnel analysis",
      "- Present insights to stakeholders",
      "Culture: collaborative, ownership mindset"
    ].join("\n");

    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({ message: posting })
    }) as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.answer).toBe("string");

    const call = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse((call?.body as string) ?? "{}") as Record<string, unknown>;
    const prompt = String((payload.messages as Array<{ content: string }>)?.[0]?.content ?? "");

    expect(prompt).toContain("Extracted job requirements");
    expect(prompt).toContain("Company name: Acme Labs");
    expect(prompt).toContain("Target role: Senior Product Analyst");
    expect(prompt).toContain("Requirement-to-profile match analysis");
    expect(prompt).toContain("5+ years of experience in product analytics");
    expect(prompt).toContain("Strong SQL and Tableau skills");
    expect(prompt).toContain("Build KPI dashboards and run funnel analysis");
  });
});
