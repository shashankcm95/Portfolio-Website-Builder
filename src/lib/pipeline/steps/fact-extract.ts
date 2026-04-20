import type { LlmClient } from "@/lib/ai/providers/types";
import {
  factExtractionResultSchema,
  type FactExtractionResult,
} from "@/lib/ai/schemas/facts";
import {
  getFactExtractionSystemPrompt,
  buildFactExtractionUserPrompt,
} from "@/lib/ai/prompts/fact-extraction";
import type { ContextPack } from "@/lib/ai/schemas/context-pack";

export interface FactExtractInput {
  contextPack: ContextPack;
  readme: string;
  dependencies: string;
  resumeContext?: string;
}

/**
 * Extracts atomic facts from repository data by sending context pack,
 * README, and dependencies to Claude.
 *
 * Returns facts and derived facts validated against the Zod schema.
 */
export async function extractFacts(
  input: FactExtractInput,
  llm: LlmClient
): Promise<FactExtractionResult> {
  const systemPrompt = getFactExtractionSystemPrompt();
  const userPrompt = buildFactExtractionUserPrompt({
    contextPack: JSON.stringify(input.contextPack, null, 2),
    readme: input.readme,
    dependencies: input.dependencies,
    resumeContext: input.resumeContext,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.structured<unknown>({
        systemPrompt,
        userPrompt:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Please return ONLY a valid JSON object with no additional text, no markdown code fences, and no explanation.`,
        maxTokens: 8192,
      });

      const parsed = factExtractionResultSchema.parse(result);

      // Post-processing: filter out low-confidence facts
      parsed.facts = parsed.facts.filter((f) => f.confidence >= 0.5);
      parsed.derivedFacts = parsed.derivedFacts.filter(
        (f) => f.confidence >= 0.5
      );

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[fact-extract] Attempt ${attempt + 1} failed:`,
        lastError.message
      );

      if (attempt === 0) {
        continue;
      }
    }
  }

  throw new Error(
    `Failed to extract facts after 2 attempts: ${lastError?.message}`
  );
}
