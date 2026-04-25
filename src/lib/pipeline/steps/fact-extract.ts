import { z } from "zod";
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
import { throwIfAborted } from "@/lib/pipeline/abort";
import { logger } from "@/lib/log";

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
  llm: LlmClient,
  signal?: AbortSignal
): Promise<FactExtractionResult> {
  throwIfAborted(signal);
  const systemPrompt = getFactExtractionSystemPrompt();
  const userPrompt = buildFactExtractionUserPrompt({
    contextPack: JSON.stringify(input.contextPack, null, 2),
    readme: input.readme,
    dependencies: input.dependencies,
    resumeContext: input.resumeContext,
  });

  let lastError: Error | null = null;

  let lastZodIssues: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await llm.structured<unknown>({
        systemPrompt,
        userPrompt:
          attempt === 0
            ? userPrompt
            : // Phase R7 — the retry now surfaces the specific zod issues
              // (paths + expected values) back to the LLM. The previous
              // "not valid JSON" message was misleading: in practice the
              // JSON parsed fine, only enum values were off.
              `${userPrompt}\n\nIMPORTANT: Your previous response had validation errors. Fix these specific issues and return ONLY valid JSON:\n${lastZodIssues ?? "Unknown validation failure"}`,
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
      logger.warn("[fact-extract] Attempt failed", {
        attempt: attempt + 1,
        error: lastError.message,
      });

      // Phase R7 — capture zod issues so the retry attempt sees them.
      if (error instanceof z.ZodError) {
        lastZodIssues = error.issues
          .slice(0, 8) // cap to keep the retry prompt short
          .map(
            (i) =>
              `- ${i.path.join(".")}: ${i.message}`
          )
          .join("\n");
      }

      if (attempt === 0) {
        continue;
      }
    }
  }

  throw new Error(
    `Failed to extract facts after 2 attempts: ${lastError?.message}`
  );
}
