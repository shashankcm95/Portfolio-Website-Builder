import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Batched embeddings — OpenAI accepts up to 2048 inputs per request. We
 * cap at 96 to keep request sizes modest and retry-friendly, and iterate
 * serially so a partial failure short-circuits cleanly. Order is
 * preserved: result[i] corresponds to texts[i].
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 96
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const slice = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: slice,
    });
    // SDK response preserves request order inside .data.
    for (const item of response.data) out.push(item.embedding);
  }
  return out;
}

export async function chatCompletion({
  systemPrompt,
  messages,
  maxTokens = 1024,
}: {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
}): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: maxTokens,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });
  return response.choices[0]?.message?.content ?? "";
}

export { openai };
