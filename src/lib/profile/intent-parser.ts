import { profileIntentSchema } from "@/lib/profile/intent-schema";
import type { ProfileField, ProfileIntent } from "@/lib/profile/types";

const phraseToField: Array<{ pattern: RegExp; field: ProfileField }> = [
  { pattern: /name|full name/i, field: "fullName" },
  { pattern: /current job|current situation/i, field: "currentJobSituation" },
  { pattern: /objective|goal|employment objective/i, field: "employmentObjective" },
  { pattern: /primary role|target role|role/i, field: "primaryRole" },
  { pattern: /location|city|region/i, field: "preferredLocation" },
  { pattern: /contract|permanent|temporary/i, field: "contractPreference" },
  { pattern: /work rate|part-time|full-time/i, field: "workRate" },
  { pattern: /permit|authorization|work permit/i, field: "workPermitStatus" },
  { pattern: /salary|compensation/i, field: "salaryExpectation" }
];

export function parseIntentFromMessage(message: string): ProfileIntent {
  const normalized = message.trim();

  const qualificationMatch = normalized.match(
    /^(add|remove)\s+(skill|diploma|certification|qualification)\s*:\s*(.+)$/i
  );
  if (qualificationMatch) {
    const operation = qualificationMatch[1].toLowerCase() === "add" ? "addItem" : "removeItem";
    return profileIntentSchema.parse({
      field: "qualifications",
      operation,
      category: qualificationMatch[2].toLowerCase(),
      value: qualificationMatch[3].trim()
    });
  }

  if (/^salary\s*:\s*(none|clear|n\/a)$/i.test(normalized)) {
    return profileIntentSchema.parse({
      field: "salaryExpectation",
      operation: "clear"
    });
  }

  const matched = phraseToField.find((item) => item.pattern.test(message));
  if (!matched) {
    throw new Error("unable_to_map_field");
  }

  const pieces = normalized.split(":");
  const value = (pieces.length > 1 ? pieces.slice(1).join(":") : normalized).trim();
  const candidate = {
    field: matched.field,
    operation: "set" as const,
    value
  };

  return profileIntentSchema.parse(candidate);
}
