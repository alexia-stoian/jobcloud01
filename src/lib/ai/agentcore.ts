import { env } from "@/lib/env";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand
} from "@aws-sdk/client-bedrock-agentcore";

/**
 * Amazon Bedrock AgentCore client for the Career Guide assistant.
 *
 * The Career Guide free-form chat is powered by a deployed AgentCore Runtime
 * agent (its logic lives in the agent, not this app). We invoke it over
 * `InvokeAgentRuntime` with `qualifier: "DEFAULT"`, authenticating with SigV4
 * from the standard AWS credential chain (inbound auth = AWS_IAM). The request
 * payload is a JSON object `{ prompt }`; the response is read fully and the
 * agent's reply text is extracted defensively (the agent's output contract can
 * be a plain string or a JSON object with a common text field).
 *
 * All failures resolve to `null` so the caller can degrade gracefully — the
 * agent invocation must never throw into the request handler.
 */

/** Region hosting the AgentCore runtime (defaults to the Bedrock region). */
function agentRegion(): string {
  return (process.env.BEDROCK_REGION ?? env.BEDROCK_REGION ?? "eu-west-1")
    .replace(/["'`\r\n]/g, "")
    .trim();
}

/** The deployed Career Guide runtime ARN. */
function runtimeArn(): string | undefined {
  const arn = (process.env.CAREERGUIDE_RUNTIME_ARN ?? env.CAREERGUIDE_RUNTIME_ARN ?? "").trim();
  return arn.length > 0 ? arn : undefined;
}

let cachedClient: BedrockAgentCoreClient | null = null;
function getClient(): BedrockAgentCoreClient {
  if (!cachedClient) {
    cachedClient = new BedrockAgentCoreClient({ region: agentRegion() });
  }
  return cachedClient;
}

/**
 * Derive a stable per-user AgentCore session id (>= 33 chars, the runtime
 * minimum). Using a deterministic id keeps ONE persistent conversation per user
 * across logins without extra storage.
 */
export function deriveCareerGuideSessionId(userId: string): string {
  const base = `careerguide-session-${userId}`;
  return base.length >= 33 ? base : base.padEnd(33, "0");
}

/** A parsed reply from the Career Guide agent. */
export type AgentReply = {
  text: string;
  options: string[];
  openField: boolean;
};

/** Coerce an options entry (string or `{ label }`/`{ value }` object) to a label string. */
function optionLabel(entry: unknown): string {
  if (typeof entry === "string") {
    return entry.trim();
  }
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    if (typeof obj.label === "string") {
      return obj.label.trim();
    }
    if (typeof obj.value === "string") {
      return obj.value.trim();
    }
  }
  return "";
}

/** Unwrap the agent's final payload: text + optional clickable options + open-field flag. */
function unwrapReply(raw: string): AgentReply {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "", options: [], openField: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON — the raw text is the reply.
    return { text: trimmed, options: [], openField: true };
  }

  if (typeof parsed === "string") {
    return { text: parsed, options: [], openField: true };
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    let text = "";
    for (const key of ["message", "result", "output", "response", "text", "completion", "answer"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim().length > 0) {
        text = value;
        break;
      }
    }
    // Anthropic-style content array: [{ type: "text", text }]
    if (!text && Array.isArray(obj.content)) {
      text = (obj.content as Array<{ text?: unknown }>)
        .filter((part) => part && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("")
        .trim();
    }

    const options = Array.isArray(obj.options)
      ? (obj.options as unknown[]).map(optionLabel).filter((label) => label.length > 0)
      : [];

    // The agent may signal whether free-text is allowed; default to allowed.
    const openField = obj.open_field !== false;

    return { text: text || trimmed, options, openField };
  }

  return { text: trimmed, options: [], openField: true };
}

/**
 * Parse the agent runtime response. AgentCore streams a Bedrock-style SSE body
 * (`data: {"event": {"contentBlockDelta": {"delta": {"text": "..."}}}}` lines);
 * we concatenate the text deltas into the full message, then unwrap it. A plain
 * (non-SSE) body is unwrapped directly.
 */
function parseAgentResponse(raw: string): AgentReply {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "", options: [], openField: true };
  }

  if (/^\s*(event:|data:)/m.test(trimmed)) {
    const parts: string[] = [];
    for (const line of trimmed.split(/\r?\n/)) {
      const match = line.match(/^\s*data:\s*(.+)$/);
      if (!match) {
        continue;
      }
      const chunk = match[1].trim();
      if (chunk === "[DONE]") {
        continue;
      }
      try {
        const evt = JSON.parse(chunk) as {
          event?: { contentBlockDelta?: { delta?: { text?: unknown } } };
        };
        const text = evt.event?.contentBlockDelta?.delta?.text;
        if (typeof text === "string") {
          parts.push(text);
        }
      } catch {
        // Ignore non-JSON data lines.
      }
    }
    if (parts.length > 0) {
      return unwrapReply(parts.join(""));
    }
  }

  return unwrapReply(trimmed);
}

/**
 * Invoke the Career Guide AgentCore runtime with a single user prompt and return
 * the agent's reply (text + options), or `null` on any misconfiguration/failure.
 */
export async function invokeCareerGuideAgent(args: {
  prompt: string;
  sessionId: string;
}): Promise<AgentReply | null> {
  const arn = runtimeArn();
  if (!arn) {
    return null;
  }

  const payload = new TextEncoder().encode(JSON.stringify({ prompt: args.prompt }));

  try {
    const result = await getClient().send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: arn,
        qualifier: "DEFAULT",
        runtimeSessionId: args.sessionId,
        contentType: "application/json",
        accept: "application/json",
        payload
      })
    );

    if (!result.response) {
      return null;
    }

    const raw = await (
      result.response as unknown as { transformToString: (encoding?: string) => Promise<string> }
    ).transformToString();

    return parseAgentResponse(raw);
  } catch (error) {
    console.error("[agentcore] Career Guide invocation failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
