import Anthropic from "@anthropic-ai/sdk";
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

function usageFromAnthropic(
  u: Anthropic.Usage | null | undefined
): TokenUsage {
  if (!u) return ZERO_USAGE;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
  };
}

/**
 * Anthropic implementation of {@link LlmClient}.
 *
 * Strict-JSON output is realized via **forced tool use**: we advertise a
 * single tool whose `input_schema` matches the caller's JSON schema, then
 * set `tool_choice: { type: "tool", name }` — the model is obligated to
 * respond with a `tool_use` block whose `input` is the parsed object.
 * This avoids the usual "the model returned a markdown fence with trailing
 * commentary" failure mode of prompt-engineered JSON.
 *
 * When no schema is provided, we fall back to prompt-engineered fenced JSON
 * extraction — matching the OpenAI client's fallback behavior so callers
 * that don't care about strict mode still get a JSON-shaped response.
 */
export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic" as const;
  private client: Anthropic;

  constructor(
    private readonly apiKey: string,
    public readonly model: string
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async structured<T>(args: LlmStructuredArgs): Promise<T> {
    try {
      if (args.jsonSchema) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: args.maxTokens ?? 4096,
          temperature: args.temperature ?? 0.3,
          system: args.systemPrompt,
          messages: [{ role: "user", content: args.userPrompt }],
          tools: [
            {
              name: args.jsonSchema.name,
              description:
                "Return the structured result for this request. Always invoke this tool.",
              // Anthropic's JSON-schema grammar is slightly different from
              // OpenAI strict-mode's but overlaps for our needs. We cast
              // here; schemas authored for storyboard pass under both.
              input_schema:
                args.jsonSchema.schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: args.jsonSchema.name },
        });

        const block = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        if (!block) {
          throw new Error(
            "Anthropic returned no tool_use block despite forced tool_choice"
          );
        }
        return block.input as T;
      }

      // No schema → prompt-engineered fenced JSON, same regex as OpenAI path
      const text = await this.text(args);
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = fenceMatch ? fenceMatch[1]?.trim() : text.trim();
      return JSON.parse(jsonStr ?? "") as T;
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  async text(args: LlmTextArgs): Promise<string> {
    // Single implementation path: consume the stream and concatenate.
    let out = "";
    for await (const chunk of this.textStream(args)) {
      out += chunk;
    }
    return out;
  }

  /**
   * Phase 6 — non-streaming call that also returns usage. Anthropic's
   * `messages.create` response carries `.usage` with `input_tokens` +
   * `output_tokens` on every success.
   */
  async measuredText(args: LlmTextArgs): Promise<MeasuredTextResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.3,
        system: args.systemPrompt,
        messages: [{ role: "user", content: args.userPrompt }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, usage: usageFromAnthropic(response.usage) };
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  /**
   * Phase 6 — structured + usage. Mirrors the forced-tool-use path of
   * `structured()` and pulls usage from the same response.
   */
  async measuredStructured<T>(
    args: LlmStructuredArgs
  ): Promise<MeasuredStructuredResult<T>> {
    try {
      if (args.jsonSchema) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: args.maxTokens ?? 4096,
          temperature: args.temperature ?? 0.3,
          system: args.systemPrompt,
          messages: [{ role: "user", content: args.userPrompt }],
          tools: [
            {
              name: args.jsonSchema.name,
              description:
                "Return the structured result for this request. Always invoke this tool.",
              input_schema:
                args.jsonSchema.schema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: args.jsonSchema.name },
        });
        const block = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        if (!block) {
          throw new Error(
            "Anthropic returned no tool_use block despite forced tool_choice"
          );
        }
        return {
          value: block.input as T,
          usage: usageFromAnthropic(response.usage),
        };
      }

      const { text, usage } = await this.measuredText(args);
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = fenceMatch ? fenceMatch[1]?.trim() : text.trim();
      return { value: JSON.parse(jsonStr ?? "") as T, usage };
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  /**
   * Stream tokens as they arrive from Anthropic. The SDK emits a typed
   * event stream; we only care about `content_block_delta` events with
   * `text_delta` deltas — other events (message_start, content_block_stop,
   * message_stop, etc.) are ignored. Matches OpenAI's behavior of
   * yielding only non-empty text chunks.
   */
  async *textStream(args: LlmTextArgs): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: args.maxTokens ?? 4096,
        temperature: args.temperature ?? 0.3,
        system: args.systemPrompt,
        messages: [{ role: "user", content: args.userPrompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const text = event.delta.text;
          if (text) yield text;
        }
      }
    } catch (e) {
      throw this.wrapError(e);
    }
  }

  private wrapError(e: unknown): Error {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = redactSecret(msg, this.apiKey);

    const status = (e as { status?: number })?.status;
    const errType = (e as { error?: { type?: string } })?.error?.type;
    if (
      status === 401 ||
      errType === "authentication_error" ||
      errType === "invalid_api_key" ||
      /authentication/i.test(msg) ||
      /invalid.*api.*key/i.test(msg)
    ) {
      return new LlmInvalidKeyError("anthropic", safe);
    }

    const wrapped = new Error(safe);
    wrapped.name = e instanceof Error ? e.name : "AnthropicError";
    return wrapped;
  }
}
