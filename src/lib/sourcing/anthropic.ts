/**
 * Shared Anthropic call + JSON-salvage util for Phase 11 sourcing.
 *
 * SERVER-ONLY. Copies the house Anthropic `fetch` pattern (behavior identical to
 * `report.ts:callAnthropic`) as a standalone helper so the new sourcing libs do
 * NOT import from or mutate the Phase 9 `report.ts`. The API key is read
 * server-side only, whitespace-stripped, never logged, and never returned in any
 * response; every failure path (missing key / non-ok / timeout / parse error)
 * returns `null` rather than throwing, so the feature degrades gracefully to
 * "no questions generated".
 */

import { env } from "@/lib/env";
import { getBedrockModel, bedrockInvokeUrl, bedrockHeaders, BEDROCK_ANTHROPIC_VERSION } from "@/lib/ai/bedrock";

type AnthropicTextContent = { type: "text"; text: string };
type AnthropicResponse = { content?: AnthropicTextContent[]; error?: { message?: string } };

/**
 * Call the Anthropic Messages API with a single user prompt and return the
 * concatenated text response, or `null` on any failure. Extended thinking is
 * disabled — these are structured JSON-extraction tasks where thinking only
 * burns the token budget and adds latency.
 */
export async function callAnthropic(prompt: string, maxTokens: number): Promise<string | null> {
  // Read the Bedrock bearer token server-side only. Strip ALL whitespace/newlines
  // (defense against a multi-line .env value silently corrupting the credential).
  // The key is never logged, never returned in any API response, and only ever
  // travels from this server to Amazon Bedrock over HTTPS — never to the browser.
  const anthropicApiKey = (process.env.AWS_BEARER_TOKEN_BEDROCK ?? env.AWS_BEARER_TOKEN_BEDROCK ?? "").replace(
    /\s+/g,
    ""
  );
  const anthropicModel = getBedrockModel();

  if (!anthropicApiKey || !anthropicModel) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetch(bedrockInvokeUrl(anthropicModel), {
      method: "POST",
      headers: bedrockHeaders(anthropicApiKey),
      body: JSON.stringify({
        anthropic_version: BEDROCK_ANTHROPIC_VERSION,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Repair the two failure modes the model produces most often inside a JSON
 * string value: LITERAL CR/LF/tab characters and UNESCAPED inner quotes. Walks
 * the text char-by-char, escaping control chars inside strings and disambiguating
 * a real closing quote (followed by `, } ] :`) from an inner narrative quote.
 * Copied in behavior from `report.ts:repairJsonStrings`.
 */
function repairJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
      }
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j++;
      }
      const next = text[j];
      if (next === undefined || next === "," || next === "}" || next === "]" || next === ":") {
        out += '"';
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Parse an LLM JSON response into `T`, or `null` when it cannot be recovered.
 * Strips a leading/trailing ```json fence, attempts `JSON.parse`, and on failure
 * applies a light salvage (repair literal newlines/quotes, unwrap a single-element
 * array) then retries once. Never throws.
 */
export function parseLlmJson<T>(raw: string): T | null {
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Unwrap a single top-level array to its first element when the caller expects
  // an object (a common "model returned [ {...} ]" wrapping).
  const unwrap = (value: unknown): unknown =>
    Array.isArray(value) && value.length === 1 ? value[0] : value;

  try {
    return unwrap(JSON.parse(cleaned)) as T;
  } catch {
    // Repair literal CR/LF/tab and unescaped inner quotes inside string values,
    // then retry once.
    try {
      cleaned = repairJsonStrings(cleaned);
      return unwrap(JSON.parse(cleaned)) as T;
    } catch {
      return null;
    }
  }
}
