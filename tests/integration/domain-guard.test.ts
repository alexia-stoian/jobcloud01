import { describe, expect, test } from "vitest";
import { isJobDomainMessage, OFF_TOPIC_RESPONSE } from "@/lib/ai/domain-guard";

describe("domain guard", () => {
  test("allows career-adjacent questions", () => {
    expect(isJobDomainMessage("How do I manage work-life balance while applying for jobs?")).toBe(true);
    expect(isJobDomainMessage("I am stressed about finding work right now")).toBe(true);
    expect(isJobDomainMessage("Can you help me negotiate salary for this role?")).toBe(true);
  });

  test("blocks clear off-topic requests", () => {
    expect(isJobDomainMessage("Can you help me with my math homework?")).toBe(false);
    expect(isJobDomainMessage("What is the weather in Zurich?")).toBe(false);
    expect(isJobDomainMessage("How do I cook pasta?")).toBe(false);
  });

  test("off-topic response keeps career redirect", () => {
    expect(OFF_TOPIC_RESPONSE.toLowerCase()).toContain("job");
    expect(OFF_TOPIC_RESPONSE.toLowerCase()).toContain("cv");
  });
});
