import type { LlmClient } from "@/lib/ai/providers/types";
import {
  narrativeResultSchema,
  type NarrativeResult,
} from "@/lib/ai/schemas/narrative";
import {
  getNarrativeGenerationSystemPrompt,
  buildNarrativeGenerationUserPrompt,
} from "@/lib/ai/prompts/narrative-generation";
import type { ContextPack } from "@/lib/ai/schemas/context-pack";
import type { Fact } from "@/lib/ai/schemas/facts";
import { throwIfAborted } from "@/lib/pipeline/abort";

export interface NarrativeGenerateInput {
  projectName: string;
  facts: Fact[];
  contextPack: ContextPack;
}

/**
 * Generates portfolio narrative sections (5 types x 2 variants = 10 sections)
 * from verified facts and project context.
 */
export async function generateNarratives(
  input: NarrativeGenerateInput,
  llm: LlmClient,
  signal?: AbortSignal
): Promise<NarrativeResult> {
  throwIfAborted(signal);
  const systemPrompt = getNarrativeGenerationSystemPrompt();

  // Build a formatted fact list for the prompt
  const factList = input.facts
    .map(
      (f, i) =>
        `[${i + 1}] (${f.category}, confidence: ${f.confidence}) ${f.claim}\n    Evidence: ${f.evidenceType} - ${f.evidenceRef}: "${f.evidenceText}"`
    )
    .join("\n\n");

  const userPrompt = buildNarrativeGenerationUserPrompt({
    projectName: input.projectName,
    factList,
    contextPack: JSON.stringify(input.contextPack, null, 2),
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.structured<unknown>({
        systemPrompt,
        userPrompt:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Please return ONLY a valid JSON object with a "sections" array containing exactly 10 section objects. No additional text, no markdown code fences, and no explanation.`,
        maxTokens: 8192,
      });

      const parsed = narrativeResultSchema.parse(result);

      // Validate we got all 10 expected sections
      if (parsed.sections.length < 10) {
        console.warn(
          `[narrative-generate] Expected 10 sections but got ${parsed.sections.length}`
        );
      }

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[narrative-generate] Attempt ${attempt + 1} failed:`,
        lastError.message
      );

      if (attempt === 0) {
        continue;
      }
    }
  }

  throw new Error(
    `Failed to generate narratives after 2 attempts: ${lastError?.message}`
  );
}
