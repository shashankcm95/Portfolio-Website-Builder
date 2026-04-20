/**
 * Phase 6 — LLM pricing table + cost math.
 *
 * All rates in **micro-USD per token** (1e-6 USD). Integer arithmetic
 * throughout — avoids the float-drift that plagues naive dollar-per-
 * million-token cost accumulators. A 300-row job aggregated in floats
 * ends up ~0.1% off; in micro-USD ints it's exact.
 *
 * Updating prices:
 *   1. Edit the relevant row below.
 *   2. Run `npm test -- pricing` to confirm the fixture still passes.
 *   3. Note that historical costs in `pipeline_step_runs` don't re-
 *      cost themselves — they stay at whatever rate was active at
 *      write time. That's by design for auditability.
 *
 * Source-of-truth:
 *   - OpenAI:    https://openai.com/api/pricing/
 *   - Anthropic: https://www.anthropic.com/pricing
 */

export interface ModelRate {
  /** Micro-USD per input token. */
  input: number;
  /** Micro-USD per output token. Embeddings have 0 here. */
  output: number;
}

/**
 * Hard-coded lookup. Unlisted models resolve to zero cost — the job
 * still succeeds, the owner sees "cost unknown" in the dashboard.
 * That's strictly better than throwing; cost tracking is observability,
 * not policy.
 */
export const PRICING: Readonly<Record<string, ModelRate>> = Object.freeze({
  // ─── OpenAI — chat ───────────────────────────────────────────────────
  // $0.15/M input, $0.60/M output → 15 µUSD / 60 µUSD per-token × 1
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4o": { input: 2500, output: 10000 },
  // ─── OpenAI — embeddings ─────────────────────────────────────────────
  // $0.02/M input.
  "text-embedding-3-small": { input: 2, output: 0 },
  "text-embedding-3-large": { input: 13, output: 0 },
  // ─── Anthropic — chat ────────────────────────────────────────────────
  // Placeholder rates — update when Haiku 4.5 pricing firms up.
  "claude-haiku-4-5": { input: 100, output: 500 },
  "claude-sonnet-4-5": { input: 3000, output: 15000 },
  "claude-opus-4-5": { input: 15000, output: 75000 },
});

/**
 * Compute cost in micro-USD for a single call. Zero for unknown models.
 * All math is integer.
 */
export function costMicroUsd(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  if (!model) return 0;
  const rate = PRICING[model];
  if (!rate) return 0;
  return (
    Math.max(0, Math.trunc(inputTokens)) * rate.input +
    Math.max(0, Math.trunc(outputTokens)) * rate.output
  );
}

/**
 * Format micro-USD as a human-readable USD string. The dashboard uses
 * this; tests pin the output shape.
 *   0           → "$0.0000"
 *   150_000     → "$0.1500"
 *   12_345_678  → "$12.3457"
 */
export function formatMicroUsd(micros: number): string {
  if (!Number.isFinite(micros)) return "$0.0000";
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(4)}`;
}
