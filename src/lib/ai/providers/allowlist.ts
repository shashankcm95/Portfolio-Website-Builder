/**
 * Static per-provider model allowlist. The BYOK save route validates the
 * user's chosen model against this list to keep supported providers explicit
 * and to reject typos like "gpt-4-old" before they cause runtime failures.
 *
 * Update this file when we want to surface a new model. Real SDK model
 * identifiers only — no marketing names.
 */

import type { LlmProvider } from "@/lib/ai/providers/types";

export const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "o1-mini",
] as const;

export const ANTHROPIC_MODELS = [
  // Haiku (cheapest, fastest)
  "claude-haiku-4-5",
  "claude-3-5-haiku-latest",
  // Sonnet (default general-purpose)
  "claude-sonnet-4-5",
  "claude-3-5-sonnet-latest",
  // Opus (strongest reasoning; priciest)
  "claude-opus-4-5",
] as const;

export type OpenAiModel = (typeof OPENAI_MODELS)[number];
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

/** Default model per provider when the user's `byokModel` is not set. */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
};

export function getModelsFor(provider: LlmProvider): readonly string[] {
  return provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;
}

export function getDefaultModel(provider: LlmProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Check whether a `model` string is on the allowlist for the given
 * `provider`. Save-time validation uses this; runtime callers trust the
 * stored value.
 */
export function validateModel(
  provider: LlmProvider,
  model: string
): boolean {
  return getModelsFor(provider).includes(model as never);
}
