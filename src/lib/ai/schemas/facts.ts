import { z } from "zod";

export const factSchema = z.object({
  claim: z.string(),
  category: z.enum([
    "tech_stack",
    "architecture",
    "feature",
    "metric",
    "methodology",
    "role",
  ]),
  confidence: z.number().min(0).max(1),
  evidenceType: z.enum([
    "repo_file",
    "readme",
    "dependency",
    "resume",
    "inferred",
  ]),
  evidenceRef: z.string(),
  evidenceText: z.string(),
});

/**
 * Phase B — quantified project outcomes extracted from README/commits.
 * An outcome is a `metric` fact with a structured numeric payload.
 *
 * Why a separate shape rather than a richer `Fact`: outcomes surface as
 * standalone UI cards ("4k+ stars", "80% latency reduction") with numeric
 * value front-and-center, while generic metric facts flow through
 * narrative generation. Keeping the shapes distinct avoids overloading
 * the fact stream with display-only fields.
 */
export const projectOutcomeSchema = z.object({
  metric: z.string().min(1),
  value: z.string().min(1),
  context: z.string().optional(),
  evidenceRef: z.string().optional(),
});

export const factExtractionResultSchema = z.object({
  facts: z.array(factSchema),
  derivedFacts: z.array(
    z.object({
      claim: z.string(),
      derivationRule: z.string(),
      sourceFactClaims: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    })
  ),
  // Phase B — optional for backwards compatibility: the LLM may return
  // zero outcomes, and legacy callers won't include the field at all.
  outcomes: z.array(projectOutcomeSchema).default([]),
});

export type Fact = z.infer<typeof factSchema>;
export type ProjectOutcome = z.infer<typeof projectOutcomeSchema>;
export type FactExtractionResult = z.infer<typeof factExtractionResultSchema>;
