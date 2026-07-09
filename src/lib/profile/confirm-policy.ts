import type { ProfileIntent } from "@/lib/profile/types";

const highImpactFields = new Set(["workPermitStatus", "primaryRole", "preferredLocation", "salaryExpectation"]);

export function requiresExplicitConfirmation(intents: ProfileIntent[]): boolean {
  return intents.some((intent) => highImpactFields.has(intent.field));
}

export function buildDiffPreview(intents: ProfileIntent[]): string[] {
  return intents.map((intent) => {
    if (intent.operation === "set") {
      return `${intent.field} -> ${intent.value}`;
    }
    if (intent.operation === "clear") {
      return `${intent.field} -> [cleared]`;
    }
    return `qualifications ${intent.operation} ${intent.category}: ${intent.value}`;
  });
}
