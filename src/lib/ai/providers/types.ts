/**
 * Pluggable LLM provider types — the contract between the pipeline (and
 * every other LLM caller) and the concrete OpenAI / Anthropic clients.
 *
 * Callers never instantiate a specific client; they resolve one via the
 * factory (`getLlmClientForUser` / `getLlmClientForProject`) which reads
 * the user's BYOK row or falls back to platform env.
 */

export type LlmProvider = "openai" | "anthropic";

/**
 * A JSON Schema spec the provider can enforce at generation time.
 *
 * - OpenAI maps to `response_format: { type: "json_schema", strict: true }`.
 * - Anthropic maps to a forced-tool-use spec — the schema becomes the
 *   `input_schema` of a single tool, and `tool_choice` forces its invocation.
 *
 * The `schema` object must satisfy BOTH providers' strict-mode requirements:
 *   - `additionalProperties: false` on every object
 *   - every property listed in `required`
 *   - no `anyOf` / `oneOf` at the top level with mixed types
 *
 * See `STORYBOARD_JSON_SCHEMA` in `src/lib/ai/schemas/storyboard.ts` for a
 * compliant reference implementation.
 */
export interface JsonSchemaSpec {
  /** Used as the tool/schema name — must be a valid identifier. */
  name: string;
  schema: Record<string, unknown>;
}

export interface LlmStructuredArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** When omitted, the provider falls back to fenced-JSON extraction. */
  jsonSchema?: JsonSchemaSpec;
}

export interface LlmTextArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Minimal contract every provider implementation satisfies. Callers use
 * `structured<T>` when they need typed JSON output; `text` otherwise.
 *
 * Phase 5.1: `textStream` is the streaming primitive — yields partial-text
 * chunks as they arrive from the provider. `text` is now a thin wrapper
 * that concatenates the stream, so provider implementations only have
 * one path to maintain.
 *
 * Phase 6: `measuredText` / `measuredStructured` return usage alongside
 * the result, used by the pipeline's observability history. Callers
 * that don't care about tokens (chatbot routes, streaming) keep using
 * the unchanged `text` / `textStream` / `structured` methods.
 */
export interface LlmClient {
  provider: LlmProvider;
  model: string;
  structured<T>(args: LlmStructuredArgs): Promise<T>;
  text(args: LlmTextArgs): Promise<string>;
  /**
   * Streaming version of `text`. Yields non-empty text chunks in order;
   * concatenating them produces the same string `text(args)` would
   * return. Throws the same error types as `text` (LlmInvalidKeyError,
   * etc.) — raised either before the first chunk or mid-stream.
   */
  textStream(args: LlmTextArgs): AsyncIterable<string>;

  /**
   * Phase 6 — same behavior as `text` but returns token usage. Used by
   * pipeline steps so the history table can cost each run. Usage is
   * reported as `{inputTokens, outputTokens}`; both may be 0 if the
   * provider didn't emit usage metadata.
   */
  measuredText(args: LlmTextArgs): Promise<MeasuredTextResult>;

  /**
   * Phase 6 — same behavior as `structured` but returns token usage.
   */
  measuredStructured<T>(
    args: LlmStructuredArgs
  ): Promise<MeasuredStructuredResult<T>>;
}

/** Token-usage metadata returned alongside measured LLM calls. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface MeasuredTextResult {
  text: string;
  usage: TokenUsage;
}

export interface MeasuredStructuredResult<T> {
  value: T;
  usage: TokenUsage;
}

/**
 * Resolved runtime config after the factory's fallback chain runs. The
 * `source` field is useful for metrics and for the UI to explain *why*
 * a particular provider is in use ("using your BYOK key" vs "using the
 * platform default").
 */
export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  source: "byok" | "platform";
}

/**
 * What the Settings API returns to the client. `hasKey` is a boolean so
 * we never send the plaintext key back down the wire — the UI just needs
 * to know whether one is configured.
 */
export interface BYOKSettings {
  provider: LlmProvider | null;
  model: string | null;
  hasKey: boolean;
  lastValidatedAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
}

// ─── Typed errors ──────────────────────────────────────────────────────────

/**
 * Thrown when NO provider is configured anywhere (no BYOK, no platform env).
 * API routes catch and map to `409 { code: "llm_not_configured" }`.
 */
export class LlmNotConfiguredError extends Error {
  code = "llm_not_configured" as const;
  constructor(
    message = "No LLM provider is configured. Set one up in Settings → AI Provider."
  ) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

/**
 * Thrown when a configured provider rejects the key (401 / authentication_error).
 * Maps to `409 { code: "llm_invalid_key", provider }`.
 */
export class LlmInvalidKeyError extends Error {
  code = "llm_invalid_key" as const;
  constructor(
    public provider: LlmProvider,
    message: string
  ) {
    super(message);
    this.name = "LlmInvalidKeyError";
  }
}
