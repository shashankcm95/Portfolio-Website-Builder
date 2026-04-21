/**
 * Phase 9 — Visitor-facing chatbot types for the Pages Function port.
 *
 * A reduced copy of `src/lib/chatbot/types.ts` covering only what the
 * published-site chatbot needs: request/response wire contracts, retrieval
 * shape, SSE frames, the canned refusal, and the handful of constants the
 * prompt builder + rate limits reference.
 *
 * Owner-side types (session row, chunker inputs, owner-ask Phase-5.2
 * fields) are deliberately omitted — they only live on the builder and
 * don't cross the Pages origin.
 *
 * A parity unit test (`tests/unit/chatbot/cf-port-parity.test.ts`)
 * guarantees the overlapping fields stay in sync with the builder copy.
 */

// ─── Retrieval ──────────────────────────────────────────────────────────────

export type ChunkType =
  | "fact"
  | "derived_fact"
  | "narrative"
  | "project_summary"
  | "profile";

export interface EmbeddingChunk {
  chunkType: ChunkType;
  chunkText: string;
  sourceRef: string;
  metadata: {
    projectId?: string;
    projectName?: string;
    [k: string]: unknown;
  };
}

export interface RetrievedChunk extends EmbeddingChunk {
  /** Cosine similarity, 0..1. BGE is L2-normalized. */
  score: number;
}

/**
 * Shape of a single row in the baked `functions/_shared/embeddings.ts`
 * module. Note the vector dimension differs from the builder: BGE-base
 * is 768-dim vs OpenAI's 1536-dim. Query + corpus must share the space.
 */
export interface ChunkRow {
  id: string;
  chunkType: ChunkType;
  chunkText: string;
  sourceRef: string | null;
  metadata: Record<string, unknown>;
  vector: number[];
}

// ─── Wire contracts (must match src/lib/chatbot/types.ts) ─────────────────

export interface ChatMessageRequest {
  portfolioId: string;
  visitorId: string;
  message: string;
}

export interface ChatMessageResponse {
  reply: string;
  sessionId: string;
}

export type ChatMessageErrorCode =
  | "bad_request"
  | "not_found"
  | "not_published"
  | "rate_limited"
  | "not_configured"
  | "internal";

export interface ChatMessageErrorBody {
  error: string;
  code: ChatMessageErrorCode;
  retryAfterMs?: number;
}

// ─── SSE wire frames ────────────────────────────────────────────────────────

export type SseFrame =
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { sessionId: string } }
  | { event: "error"; data: { error: string; code: string } };

// ─── Constants (must match builder copy) ────────────────────────────────────

export const MAX_VISITOR_MESSAGE_CHARS = 500;
export const MAX_CONTEXT_CHUNKS = 8;

/** BGE-base dimensionality. Distinct from the builder's 1536. */
export const EMBEDDING_DIM_BGE = 768;

// ─── Refusal template (must match builder's CANNED_REFUSAL) ───────────────

export const CANNED_REFUSAL =
  "I can only help with questions about {ownerName}'s work. " +
  "What would you like to know about their projects or background?";
