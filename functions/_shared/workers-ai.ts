/**
 * Phase 9 — Thin wrapper around `env.AI.run(...)` for Workers AI.
 *
 * Two runtime surfaces matter for the visitor chatbot:
 *
 *   1. **Query embedding** — BGE-base produces a 768-dim vector for the
 *      visitor's question. Must match the space the corpus was re-embedded
 *      into at publish time.
 *
 *   2. **Generation** — Llama 3.1 8B, streaming. Returns a `ReadableStream`
 *      of SSE frames in Cloudflare's wire format; we re-encode them into
 *      the chatbot's wire format via `stream.ts`.
 *
 * Typed against Workers types (`@cloudflare/workers-types`). The actual
 * `AI` binding is configured in the Pages project's `wrangler.toml`
 * (`[ai] binding = "AI"`), which this module accesses via the injected
 * `env` parameter. No API keys — billing goes to the owner's CF account.
 */

/// <reference types="@cloudflare/workers-types" />

/** Model IDs — pinned so server-side changes are visible in code review. */
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const GENERATION_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** BGE-base dimensionality. Keep in sync with `types.EMBEDDING_DIM_BGE`. */
export const BGE_DIMENSIONS = 768;

export interface Env {
  /** Workers AI binding configured in wrangler.toml. */
  AI: Ai;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Embed a single string with BGE-base. Returns the 768-dim vector (already
 * L2-normalized by the model).
 *
 * Throws on AI binding misconfig; callers wrap in try/catch and map to a
 * `not_configured` error frame. One input at a time — BGE supports batch,
 * but the chatbot only embeds the live visitor query here (corpus is
 * pre-embedded at publish time).
 */
export async function embedQuery(
  env: Env,
  text: string
): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) return new Array(BGE_DIMENSIONS).fill(0);

  const result = (await env.AI.run(EMBEDDING_MODEL as any, {
    text: [trimmed],
  } as any)) as unknown as { data: number[][] };

  const vec = result?.data?.[0];
  if (!Array.isArray(vec)) {
    throw new Error("workers-ai embedQuery: empty response");
  }
  return vec;
}

/**
 * Run Llama 3.1 8B with streaming enabled. The binding returns a
 * `ReadableStream<Uint8Array>` of SSE frames in Cloudflare's wire
 * format:
 *
 *     data: {"response":"<token>","p":"..."}\n\n
 *     data: [DONE]\n\n
 *
 * Callers transform these into the chatbot's own frame shape via
 * `iterateTokens()` + `stream.ts`.
 */
export async function runGeneration(
  env: Env,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<ReadableStream<Uint8Array>> {
  const result = await env.AI.run(GENERATION_MODEL as any, {
    messages,
    stream: true,
    max_tokens: options.maxTokens ?? 600,
    temperature: options.temperature ?? 0.2,
  } as any);

  if (!(result instanceof ReadableStream)) {
    throw new Error(
      "workers-ai runGeneration: expected stream, got non-stream response"
    );
  }
  return result as ReadableStream<Uint8Array>;
}

/**
 * Async-iterate the text tokens out of a Workers AI stream. Parses the
 * CF wire format + strips the terminal `[DONE]` sentinel. Yields plain
 * strings the caller can re-encode via `encodeToken(...)`.
 *
 * The CF wire format is standard-ish SSE with a JSON payload per `data:`
 * line: `{"response":"hello", ...}`. Malformed lines are skipped; a
 * missing `response` field emits the empty string (no-op to the client).
 */
export async function* iterateTokens(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on SSE record boundaries (blank line). Keep the last
      // partial record in the buffer for the next read.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const record = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const token = parseRecord(record);
        if (token === null) return; // [DONE] sentinel — stop iterating
        if (token.length > 0) yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE record. Returns:
 *   - null   → the `[DONE]` sentinel; caller should stop.
 *   - string → the `response` field (may be empty).
 *   - ""     → unrecognized / malformed record (swallow silently).
 */
function parseRecord(record: string): string | null {
  // Each record may have multiple lines; we only care about `data:` lines.
  for (const line of record.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return null;
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload) as { response?: unknown };
      if (typeof parsed.response === "string") return parsed.response;
    } catch {
      // Skip malformed JSON — CF occasionally emits keep-alives.
    }
  }
  return "";
}
