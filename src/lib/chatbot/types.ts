/**
 * Phase 5 — Visitor chatbot. Shared types for RAG + wire contracts.
 *
 * A "session" is a rolling transcript for a single (portfolio, visitor)
 * pair. The visitor is identified by a client-generated UUID in
 * localStorage — no authentication, no tracking cookie. The server
 * persists every turn to `chatbot_sessions.messages`.
 *
 * The runtime prompt is always: system prompt + one user turn containing
 * (a) retrieved context chunks and (b) the current question. Prior turns
 * are NOT fed back into the model — see plan doc §Design Decision 2.
 */

// ─── Messages ───────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** ISO-8601. Stored in the JSONB column so the ordering survives writes. */
  createdAt: string;
}

export interface ChatbotSessionRow {
  id: string;
  portfolioId: string;
  visitorId: string | null;
  messages: ChatMessage[];
  metadata: {
    userAgent?: string;
    firstSeenAt?: string;
    [k: string]: unknown;
  };
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

export type ChunkType =
  | "fact"
  | "derived_fact"
  | "narrative"
  | "project_summary"
  | "profile";

/** A single chunk emitted by the chunker, ready for embedding + insert. */
export interface EmbeddingChunk {
  chunkType: ChunkType;
  chunkText: string;
  /** e.g. `facts:{id}`, `generatedSections:{id}#para={n}`, `profile:{portfolioId}`. */
  sourceRef: string;
  metadata: {
    projectId?: string;
    projectName?: string;
    [k: string]: unknown;
  };
}

/** Chunk + cosine score returned by the retriever. */
export interface RetrievedChunk extends EmbeddingChunk {
  /** Cosine similarity, 0..1. OpenAI embeddings are L2-normalized so ≈ dot product. */
  score: number;
}

// ─── Wire contracts ─────────────────────────────────────────────────────────

export interface ChatMessageRequest {
  portfolioId: string;
  /** Client-generated UUID, persisted in visitor's localStorage. */
  visitorId: string;
  /** Trimmed, ≤ MAX_VISITOR_MESSAGE_CHARS. */
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
  /** Present on rate-limit 429s. */
  retryAfterMs?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max characters in a single visitor message. Server-side enforced. */
export const MAX_VISITOR_MESSAGE_CHARS = 500;

/** Top-K chunks pulled into the context window per message. */
export const MAX_CONTEXT_CHUNKS = 8;

/** Per-visitor sliding window. */
export const PER_VISITOR_WINDOW_MS = 10 * 60 * 1000; // 10 min
export const PER_VISITOR_MESSAGES = 20;

/** Per-portfolio sliding window — caps total spend on a single portfolio. */
export const PER_PORTFOLIO_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h
export const PER_PORTFOLIO_MESSAGES = 300;

/** Narrative paragraphs longer than this (chars) are sentence-split. */
export const CHUNK_MAX_CHARS = 1600;

/** `facts.evidenceText` is truncated to this length inside fact chunks. */
export const FACT_EVIDENCE_TRUNCATE_CHARS = 400;

/** OpenAI text-embedding-3-small dimension — enforced in cosine math. */
export const EMBEDDING_DIM = 1536;

// ─── Phase 5.2 — owner customization ────────────────────────────────────────

/** Owner-supplied greeting (first assistant message). Server-enforced cap. */
export const MAX_GREETING_CHARS = 500;

/** Owner-supplied starter question chip length cap. */
export const MAX_STARTER_CHARS = 120;

/** How many starter chips the owner can author. */
export const MAX_STARTERS = 3;

/**
 * Public per-portfolio chatbot config consumed by the iframe page. When
 * `greeting` is null the widget just shows the generic placeholder; when
 * `starters` is empty no chips render.
 */
export interface ChatbotPublicConfig {
  greeting: string | null;
  starters: string[];
}

// ─── Phase 5.1 — SSE wire frames ────────────────────────────────────────────

/** Discriminated union of every server-emitted SSE event type. */
export type SseFrame =
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { sessionId: string } }
  | { event: "error"; data: { error: string; code: string } };

/**
 * Canonical off-topic refusal. The visitor system prompt instructs the
 * model to echo this near-verbatim; tests assert its presence in the
 * prompt + in the adversarial-eval success criteria. `{ownerName}` is
 * interpolated by the prompt builder at request time.
 */
export const CANNED_REFUSAL =
  "I can only help with questions about {ownerName}'s work. " +
  "What would you like to know about their projects or background?";
