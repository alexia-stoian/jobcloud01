import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The detector takes apiKey/model as explicit args, but we mock @/lib/env for parity with
// the integration setup and to guard against any transitive env import.
vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test"
  }
}));

import { detectTargetRoleIntent } from "@/lib/onboarding/detect-target-role-llm";

type AnthropicRequestBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
};

function anthropicRoleResponse(role: string | null): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ role }) }]
    })
  } as Response);
}

function capturedBody(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): AnthropicRequestBody {
  const call = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse((call?.body as string) ?? "{}") as AnthropicRequestBody;
}

describe("detectTargetRoleIntent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // u1 — REQUIRED proof of Behavior #2: the practice/interview-answer discrimination
  // instruction must reach the prompt when inPractice is true.
  test("inPractice=true sends the interview-answer discrimination instruction in the system prompt", async () => {
    fetchMock.mockImplementationOnce(() => anthropicRoleResponse("Product Manager"));

    const role = await detectTargetRoleIntent({
      message: "I want to become a Product Manager",
      inPractice: true,
      apiKey: "test-key",
      model: "claude-test"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = capturedBody(fetchMock);
    // The prompt must instruct the model to return null when the role is merely mentioned
    // in an interview/practice answer rather than expressed as first-person career intent.
    expect(body.system).toContain("answering an interview/practice question");
    expect(body.system).toContain("NOT intent");
    expect(body.system).toContain("return null unless");
    expect(role).toBe("Product Manager");
  });

  // u2 — same message without practice mode still fetches, and need NOT carry the clause.
  test("inPractice=false still fetches but omits the interview-answer discrimination clause", async () => {
    fetchMock.mockImplementationOnce(() => anthropicRoleResponse("Product Manager"));

    const role = await detectTargetRoleIntent({
      message: "I want to become a Product Manager",
      inPractice: false,
      apiKey: "test-key",
      model: "claude-test"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = capturedBody(fetchMock);
    expect(body.system).not.toContain("answering an interview/practice question");
    expect(role).toBe("Product Manager");
  });

  // u3 — a message that fails the INTENT_HINT pre-filter never hits the network.
  test("a message failing the INTENT_HINT pre-filter makes zero fetch calls and returns null", async () => {
    const role = await detectTargetRoleIntent({
      message: "The team helped the company become a data-driven organization last year.",
      inPractice: false,
      apiKey: "test-key",
      model: "claude-test"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(role).toBeNull();
  });

  test("returns a normalized, length-capped role and never throws on a null LLM result", async () => {
    fetchMock.mockImplementationOnce(() => anthropicRoleResponse(null));

    const role = await detectTargetRoleIntent({
      message: "I'm targeting a senior role",
      inPractice: false,
      apiKey: "test-key",
      model: "claude-test"
    });

    expect(role).toBeNull();
  });

  test("returns null (does not throw) on a non-ok response", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, json: async () => ({}) } as Response)
    );

    const role = await detectTargetRoleIntent({
      message: "I want to become a UX Designer",
      inPractice: false,
      apiKey: "test-key",
      model: "claude-test"
    });

    expect(role).toBeNull();
  });

  test("returns null when apiKey is missing without hitting the network", async () => {
    const role = await detectTargetRoleIntent({
      message: "I want to become a UX Designer",
      inPractice: false,
      apiKey: undefined,
      model: "claude-test"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(role).toBeNull();
  });
});
