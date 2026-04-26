import React from "react";
import type { SentenceVerification } from "./types";

interface VerifiedNarrativeProps {
  /**
   * The narrative paragraph (or stack of paragraphs joined by `\n\n`).
   * When falsy, the component renders nothing — callers can drop it
   * inline without an extra guard.
   */
  text: string | undefined;
  /**
   * Phase E4b — sentence-level verification from the pipeline. Each
   * entry's `text` should match a sentence emitted by the same
   * splitter the pipeline used; mismatches fall through to status
   * "pending" so visitors never see broken markers.
   *
   * When omitted (older projects, manual edits), the component falls
   * back to a plain `<p>` per paragraph — output matches the
   * pre-E4b shape exactly.
   */
  verifications?: SentenceVerification[];
}

/**
 * Phase E4b — render a narrative section with sentence-level
 * verification markers. Pure paragraph renderer: emits one `<p>` per
 * paragraph in the source text. No wrapper section, no heading — the
 * caller wraps it however its existing layout dictates (signal puts
 * it inside `.prose`; classic / minimal / editorial put it inside a
 * `.project-section` div with their own `<h3>`).
 *
 * When `verifications` is provided, sentences become `<span>`s with a
 * `pwb-sentence pwb-sentence-<status>` class so per-template CSS can
 * decide whether to surface a `✓` / `!` / underline / nothing.
 *
 * Adopting the component is a pure-additive change: templates that
 * wire `verifications` get ticks; templates that don't keep
 * rendering exactly as before.
 */
export function VerifiedNarrative({
  text,
  verifications,
}: VerifiedNarrativeProps) {
  if (!text || text.length === 0) return null;

  // The pipeline writes paragraph breaks as double newlines. We split
  // into paragraphs first, then per-paragraph either render plain text
  // (no verifications) or sentence spans (verifications present).
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  if (!verifications || verifications.length === 0) {
    // No verifications? Plain paragraphs — markup matches pre-E4b
    // template output exactly so adopting this component never
    // introduces a snapshot diff for projects predating claim_verify.
    return (
      <>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </>
    );
  }

  // The verifications array is keyed against the FULL section's
  // sentence stream (cross-paragraph). Walk through it as we tokenize
  // each paragraph so per-paragraph index lookups stay correct.
  let cursor = 0;
  return (
    <>
      {paragraphs.map((para, pi) => {
        const sentences = splitIntoSentences(para);
        return (
          <p key={pi} className="pwb-narrative-text">
            {sentences.map((sentence, si) => {
              const verif = verifications[cursor];
              cursor += 1;
              // The verifier and our splitter should agree on
              // boundaries, but we fall back to "pending" if they
              // drift past the array length.
              const status = verif?.status ?? "pending";
              return (
                <React.Fragment key={si}>
                  <span
                    className={`pwb-sentence pwb-sentence-${status}`}
                    data-pwb-status={status}
                  >
                    {sentence}
                  </span>
                  {si < sentences.length - 1 ? " " : ""}
                </React.Fragment>
              );
            })}
          </p>
        );
      })}
    </>
  );
}

/**
 * Phase E4b — mirrors the pipeline's sentence splitter
 * (`src/lib/pipeline/steps/claim-verify.ts :: splitIntoSentences`)
 * exactly so sentence indexes line up. Kept inline here to avoid a
 * cross-module dep — templates are intentionally pipeline-
 * independent.
 */
function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
