import { callClaudeStructured } from "@/lib/ai/claude";
import {
  verificationResultSchema,
  type VerificationResult,
} from "@/lib/ai/schemas/verification";
import {
  getClaimVerificationSystemPrompt,
  buildClaimVerificationUserPrompt,
} from "@/lib/ai/prompts/claim-verification";
import type { Fact } from "@/lib/ai/schemas/facts";

export interface ClaimVerifyInput {
  generatedText: string;
  facts: Fact[];
  sectionType: string;
  variant: string;
}

/**
 * Verifies each sentence in generated text against a list of known facts.
 * Splits text into sentences, sends to Claude for verification,
 * and returns verification results for each claim.
 */
export async function verifyClaims(
  input: ClaimVerifyInput
): Promise<VerificationResult> {
  const systemPrompt = getClaimVerificationSystemPrompt();

  // Build a formatted fact list for the prompt
  const factList = input.facts
    .map(
      (f, i) =>
        `[${i + 1}] (${f.category}) ${f.claim}\n    Evidence: ${f.evidenceType} - ${f.evidenceRef}`
    )
    .join("\n\n");

  const userPrompt = buildClaimVerificationUserPrompt({
    generatedText: input.generatedText,
    factList,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callClaudeStructured<unknown>({
        systemPrompt,
        userPrompt:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Please return ONLY a valid JSON object with a "claims" array. No additional text, no markdown code fences, and no explanation.`,
        maxTokens: 8192,
      });

      const parsed = verificationResultSchema.parse(result);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[claim-verify] Attempt ${attempt + 1} failed:`,
        lastError.message
      );

      if (attempt === 0) {
        continue;
      }
    }
  }

  throw new Error(
    `Failed to verify claims after 2 attempts: ${lastError?.message}`
  );
}

/**
 * Splits text into sentences using basic punctuation rules.
 * Handles common abbreviations and edge cases.
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences;
}
