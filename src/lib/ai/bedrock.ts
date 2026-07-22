import { env } from "@/lib/env";

/**
 * Amazon Bedrock helper for calling Anthropic Claude models via the
 * InvokeModel endpoint using a Bedrock API key (Bearer token).
 *
 * The request/response bodies use the Anthropic Messages API shape, so callers
 * that already parse `{ content: [{ type: "text", text }] }` need no changes —
 * the only differences from the direct Anthropic API are:
 *   - the endpoint URL (per-region Bedrock runtime, model id in the path),
 *   - Bearer auth instead of `x-api-key`,
 *   - `anthropic_version` lives in the body (not a header) and the `model`
 *     field is omitted (it is encoded in the URL).
 *
 * Config is read from `process.env` directly (with inline defaults) so this
 * module can be imported by request handlers and library helpers without
 * forcing every consumer/test to load the full validated env schema.
 */

/** Anthropic version string Bedrock expects inside the request body. */
export const BEDROCK_ANTHROPIC_VERSION = "bedrock-2023-05-31";

const DEFAULT_REGION = "eu-west-1";
const DEFAULT_MODEL = "eu.anthropic.claude-sonnet-5";

function sanitize(value: string): string {
  return value.replace(/["'`\r\n]/g, "").trim();
}

/** Bedrock API key (Bearer token). Read server-side only. */
export function getBedrockApiKey(): string | undefined {
  return process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || undefined;
}

/** Bedrock region hosting the runtime endpoint (e.g. "eu-west-1"). */
export function getBedrockRegion(): string {
  const value = process.env.BEDROCK_REGION?.trim();
  return value ? sanitize(value) : DEFAULT_REGION;
}

/** Bedrock model / inference-profile id (e.g. "eu.anthropic.claude-sonnet-5"). */
export function getBedrockModel(): string {
  const value = process.env.BEDROCK_MODEL_ID?.trim();
  return value ? sanitize(value) : DEFAULT_MODEL;
}

/** Build the InvokeModel URL for a given model id and region. */
export function bedrockInvokeUrl(model: string, region: string = getBedrockRegion()): string {
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;
}

/** Standard headers for a Bedrock InvokeModel request using a Bearer API key. */
export function bedrockHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}
