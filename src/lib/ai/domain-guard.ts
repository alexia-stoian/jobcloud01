const forbiddenTopics = ["recipe", "movie", "travel", "politics", "shopping"];

export function assertJobDomainMessage(message: string): void {
  const lower = message.toLowerCase();
  if (forbiddenTopics.some((topic) => lower.includes(topic))) {
    throw new Error("domain_violation");
  }
}
