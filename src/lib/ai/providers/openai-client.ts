import OpenAI from "openai";
import {
  LlmInvalidKeyError,
  type LlmClient,
  type LlmStructuredArgs,
  type LlmTextArgs,
  type MeasuredStructuredResult,
  type MeasuredTextResult,
  type TokenUsage,
} from "@/lib/ai/providers/types";
import { redactSecret } from "@/lib/ai/redact";

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

function usageFromOpenAi(
  u: OpenAI.CompletionUsage | null | undefined
): TokenUsage {
  if (!u) return ZERO_USAGE;
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
  };
}

/**
 * OpenAI implementation of {@link LlmClient}.
 *
 * - `structured<T>` uses native `response_format: { type: "json_schema", strict: true }`
 *   when a schema is provided; otherwise falls back to markdown-fenced-JSON
 *   extraction (preserves the pre-Phase-3.5 behavior for callers that don't
 *   provide a schema, e.g. resume-structure).
 * - `text` is a plain chat completion.
 *
 * Each instance constructs its own `OpenAI` SDK client bound to the caller's
 * apiKey. We intentionally do NOT cache clients across users — per-call
 * instantiation is cheap and keeps keys out of module-level state.
 */
export class OpenAiClient implements LlmClient {
  readonly provider = "openai" as const;
  private client: OpenAI;

  constructor(
    private readonly apiKey: string,
    public readonly model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async structured<T>(args: LlmStructuredArgs): Promise<T> {
    try {
      if (args.jsonSchema) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: args.maxTokens ?? 4096,
          temperature: args.temperature ?? 0.3,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: args.jsonSchema.name,
              strict: true,
              schema: args.jsonSchema.schema,
            },
          },
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userPrompt },
          ],
        });
        const content = response.choices[0]?.message?.content ?? "";
        return JSON.parse(content) as T;
      }

      // No schema → legacy fenced-JSON extraction
      const text = await this.text(args);
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = fenceMatch ? fenceMatch[1]?.trim() : text.trim();
      return JSON.parse(jsonStr ?? "") as T;
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  async text(args: LlmTextArgs): Promise<string> {
    // One implementation path — consume the stream and concatenate.
    let out = "";
    for await (const chunk of this.textStream(args)) {
      out += chunk;
    }
    return out;
  }

  /**
   * Phase 6 — same as `text` but captures usage. OpenAI streaming does
   * emit usage metadata (on the final chunk when `stream_options:
   * {include_usage: true}` is set), but it's awkward to intermix with
   * token-yield semantics. For clarity we run the non-streaming path
   * here — pipeline steps aren't latency-critical, and the `usage`
   * response is exact + one-line to extract.
   */
  async measuredText(args: LlmTextArgs): Promise<MeasuredTextResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.3,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      });
      return {
        text: response.choices[0]?.message?.content ?? "",
        usage: usageFromOpenAi(response.usage),
      };
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  /**
   * Phase 6 — structured JSON with token-usage metadata. Mirrors
   * `structured()` exactly apart from the return shape + the usage
   * extraction on the single happy-path call.
   */
  async measuredStructured<T>(
    args: LlmStructuredArgs
  ): Promise<MeasuredStructuredResult<T>> {
    try {
      if (args.jsonSchema) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: args.maxTokens ?? 4096,
          temperature: args.temperature ?? 0.3,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: args.jsonSchema.name,
              strict: true,
              schema: args.jsonSchema.schema,
            },
          },
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userPrompt },
          ],
        });
        const content = response.choices[0]?.message?.content ?? "";
        return {
          value: JSON.parse(content) as T,
          usage: usageFromOpenAi(response.usage),
        };
      }

      // Fenced-JSON fallback — reuse measuredText + the same regex as
      // the legacy `structured()` path. Usage is still reported because
      // the underlying call was measured.
      const { text, usage } = await this.measuredText(args);
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = fenceMatch ? fenceMatch[1]?.trim() : text.trim();
      return { value: JSON.parse(jsonStr ?? "") as T, usage };
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  /**
   * Stream tokens as they arrive from OpenAI. Filters out empty deltas so
   * downstream SSE frames never carry `{text:""}`. Errors are wrapped via
   * `wrapError` exactly like the non-streaming path — the raise point
   * just moves from pre-await to inside the generator.
   */
  async *textStream(args: LlmTextArgs): AsyncIterable<string> {
    let stream: Awaited<
      ReturnType<typeof this.client.chat.completions.create>
    >;
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.3,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
        stream: true,
      });
    } catch (e) {
      throw this.wrapError(e);
    }

    try {
      for await (const event of stream as AsyncIterable<{
        choices: Array<{ delta?: { content?: string | null } }>;
      }>) {
        const delta = event.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  /**
   * Map OpenAI SDK errors onto our typed hierarchy:
   *   - 401 / invalid_api_key → LlmInvalidKeyError (caller maps to 409)
   *   - anything else         → bubbled with the key redacted from the message
   */
  private wrapError(e: unknown): Error {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = redactSecret(msg, this.apiKey);

    const status = (e as { status?: number })?.status;
    const code = (e as { code?: string })?.code;
    if (
      status === 401 ||
      code === "invalid_api_key" ||
      code === "authentication_error" ||
      /invalid api key/i.test(msg) ||
      /authentication/i.test(msg)
    ) {
      return new LlmInvalidKeyError("openai", safe);
    }

    const wrapped = new Error(safe);
    wrapped.name = e instanceof Error ? e.name : "OpenAiError";
    return wrapped;
  }
}
