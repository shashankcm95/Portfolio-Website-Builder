import { callClaudeStructured } from "@/lib/ai/claude";
import {
  structuredResumeSchema,
  type StructuredResume,
} from "@/lib/ai/schemas/resume";
import {
  getResumeStructuringSystemPrompt,
  buildResumeStructuringUserPrompt,
} from "@/lib/ai/prompts/resume-structuring";

/**
 * Sends raw resume text to Claude for structured extraction.
 * Parses the response against the Zod schema.
 * Retries once on parse failure with a more explicit prompt.
 */
export async function structureResume(
  rawText: string
): Promise<StructuredResume> {
  const systemPrompt = getResumeStructuringSystemPrompt();
  const userPrompt = buildResumeStructuringUserPrompt(rawText);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callClaudeStructured<unknown>({
        systemPrompt,
        userPrompt:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Please return ONLY a valid JSON object with no additional text, no markdown code fences, and no explanation.`,
        maxTokens: 4096,
      });

      const parsed = structuredResumeSchema.parse(result);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[resume-structure] Attempt ${attempt + 1} failed:`,
        lastError.message
      );

      if (attempt === 0) {
        // Retry once
        continue;
      }
    }
  }

  throw new Error(
    `Failed to structure resume after 2 attempts: ${lastError?.message}`
  );
}
