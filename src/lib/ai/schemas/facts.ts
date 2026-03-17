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
});

export type Fact = z.infer<typeof factSchema>;
export type FactExtractionResult = z.infer<typeof factExtractionResultSchema>;
