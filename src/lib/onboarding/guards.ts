const scopePatterns = [
  /job/i,
  /cv/i,
  /resume/i,
  /role/i,
  /permit/i,
  /cert/i,
  /language/i,
  /salary/i,
  /work/i,
  /location/i
];

export function isOnboardingInScope(message: string): boolean {
  return scopePatterns.some((pattern) => pattern.test(message));
}

export function isHighImpactField(field?: string): boolean {
  return field === "primaryRole" || field === "preferredLocation" || field === "workPermitStatus";
}
