import { z } from "zod";

/**
 * Phase E7 — Field types the suggestion engine knows how to populate.
 *
 * The portfolio builder's identity editor leaves these fields blank by
 * default; we generate a small slate of context-aware suggestions on
 * demand so owners aren't staring at an empty form. Mix of
 * deterministic ranking (employers, anchor stat) and LLM generation
 * (positioning, CTA copy) — see suggest.ts for per-field implementations.
 */
export const suggestFieldEnum = z.enum([
  "positioning",
  "namedEmployers",
  "ctaText",
  "ctaHref",
  "anchorStat",
  // Phase E8b — universal Tier-1 recruiter signals.
  "currentRole",
  "currentCompany",
  "workEligibility",
]);

export type SuggestField = z.infer<typeof suggestFieldEnum>;

/**
 * The shape returned for each field type. Suggestions are typed
 * differently per field because the identity editor expects different
 * shapes (string vs string[] vs structured object). The discriminated
 * union keeps the API caller's code branchable.
 */
export type AnchorStatSuggestion = {
  value: string;
  unit: string;
  context?: string;
  /** Optional human-readable trace of where this candidate came from. */
  rationale?: string;
};

export type SuggestResponse =
  | { field: "positioning"; suggestions: string[] }
  | { field: "ctaText"; suggestions: string[] }
  | { field: "ctaHref"; suggestions: string[] }
  | { field: "namedEmployers"; suggestions: string[] }
  | { field: "anchorStat"; suggestions: AnchorStatSuggestion[] }
  | { field: "currentRole"; suggestions: string[] }
  | { field: "currentCompany"; suggestions: string[] }
  | { field: "workEligibility"; suggestions: string[] };

/**
 * Request body shape — caller picks one field at a time and optionally
 * passes a `seed` so two consecutive "regenerate" clicks return
 * different candidates rather than the same set. The seed is hashed
 * into the LLM prompt's temperature seed so generation is varied but
 * determinism is preserved within a seed.
 */
export const suggestRequestSchema = z.object({
  field: suggestFieldEnum,
  /** Optional integer; rotates the LLM seed for "regenerate" click. */
  seed: z.number().int().nonnegative().max(1_000_000).optional(),
  /** How many candidates to return. Default 3, max 5. */
  count: z.number().int().min(1).max(5).optional(),
});

export type SuggestRequest = z.infer<typeof suggestRequestSchema>;
