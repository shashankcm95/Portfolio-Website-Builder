import { AnthropicClient } from "@/lib/ai/providers/anthropic-client";
import { OpenAiClient } from "@/lib/ai/providers/openai-client";
import {
  LlmInvalidKeyError,
  type LlmProvider,
} from "@/lib/ai/providers/types";
import { redactSecret } from "@/lib/ai/redact";

/**
 * Cheapest possible live call to confirm a user-supplied API key + model
 * combination actually works. Called by the Settings PUT endpoint *before*
 * the key is persisted — rejects bad keys at the point of entry rather
 * than letting them silently fail in an async pipeline 30 seconds later.
 *
 * Budget: ~8 output tokens, ~$0.0001 per call.
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, reason }` on any
 * provider error (auth or otherwise). Never throws — the settings route
 * turns `!ok` into a 400.
 */
export type ValidateKeyResult =
  | { ok: true }
  | { ok: false; reason: string; category: "invalid_key" | "other" };

export async function validateKey(
  provider: LlmProvider,
  apiKey: string,
  model: string
): Promise<ValidateKeyResult> {
  const client =
    provider === "openai"
      ? new OpenAiClient(apiKey, model)
      : new AnthropicClient(apiKey, model);

  try {
    // Minimal probe: system + user prompts that demand ~1 token of output.
    // Both providers consider this a billable call, but at < $0.0001.
    await client.text({
      systemPrompt: "Respond with the single word: OK.",
      userPrompt: "ping",
      maxTokens: 8,
      temperature: 0,
    });
    return { ok: true };
  } catch (e) {
    const safe = redactSecret(
      e instanceof Error ? e.message : String(e),
      apiKey
    );
    if (e instanceof LlmInvalidKeyError) {
      return {
        ok: false,
        reason: "Invalid API key for this provider.",
        category: "invalid_key",
      };
    }
    return {
      ok: false,
      reason: safe || "Unknown provider error",
      category: "other",
    };
  }
}
