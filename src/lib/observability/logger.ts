type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, data?: unknown): void {
  const payload = {
    level,
    event,
    data,
    timestamp: new Date().toISOString()
  };
  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.log(payload);
}
