/**
 * Phase 5 — JS-side top-K retrieval over embeddings.
 *
 * We store embeddings as JSON-encoded float arrays in `embeddings.embedding`
 * (text column). For a typical portfolio (50-200 chunks) we can pull them
 * all and rank in JS in <10ms. This avoids installing pgvector in 5.0.
 * Migration path: swap this file's implementation for a pgvector query
 * when the corpus exceeds ~2 000 chunks.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { embeddings, projects } from "@/lib/db/schema";
import {
  EMBEDDING_DIM,
  MAX_CONTEXT_CHUNKS,
  type ChunkType,
  type RetrievedChunk,
} from "./types";

// ─── Cosine + helpers ──────────────────────────────────────────────────────

/**
 * Cosine similarity of two equal-length numeric arrays. Returns 0 when
 * either input is zero-length or magnitude-zero. OpenAI's
 * text-embedding-3-small is L2-normalized so magnitudes are ≈1 — we still
 * compute them for safety (callers may hand us scaled vectors in tests).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Parse the DB-stored JSON string back into a plain number[]. Returns
 * null on malformed input — the caller drops that row from ranking
 * rather than failing the whole query.
 */
export function parseEmbeddingCell(raw: string): number[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const v of parsed) {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
    }
    return parsed as number[];
  } catch {
    // Embedding cell corrupt — treat as absent so retrieval skips this row.
    return null;
  }
}

// ─── Pure ranking core (shared with the Phase 9 Pages Function port) ──────

/**
 * A single candidate chunk for the `rankChunks` ranker. Accepts pre-parsed
 * vectors so callers that already hold the numeric array (e.g. the
 * Phase 9 Function with a baked JSON corpus) don't pay the JSON.parse
 * cost per call.
 */
export interface RankableChunk {
  id: string;
  chunkType: ChunkType;
  chunkText: string;
  sourceRef: string | null;
  metadata: Record<string, unknown>;
  vector: number[];
}

/**
 * Rank a pre-loaded set of chunks by cosine similarity to a query vector
 * and return the top-K. Pure function — no DB, no I/O. The Phase 9
 * Pages Function port (`functions/_shared/retrieve.ts`) imports this via
 * a co-copy so both the builder-side and published-site chatbots rank
 * identically.
 *
 * Ties are broken deterministically (id ASC) so tests don't flake.
 */
export function rankChunks(
  queryEmbedding: number[],
  candidates: readonly RankableChunk[],
  k: number = MAX_CONTEXT_CHUNKS
): RetrievedChunk[] {
  type Scored = {
    score: number;
    id: string;
    chunkType: ChunkType;
    chunkText: string;
    sourceRef: string | null;
    metadata: Record<string, unknown>;
  };

  const scored: Scored[] = [];
  for (const c of candidates) {
    const score = cosineSimilarity(queryEmbedding, c.vector);
    scored.push({
      score,
      id: c.id,
      chunkType: c.chunkType,
      chunkText: c.chunkText,
      sourceRef: c.sourceRef,
      metadata: c.metadata,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return scored.slice(0, k).map((s) => ({
    chunkType: s.chunkType,
    chunkText: s.chunkText,
    sourceRef: s.sourceRef ?? `embeddings:${s.id}`,
    metadata: s.metadata,
    score: s.score,
  }));
}

// ─── Primary entry point ────────────────────────────────────────────────────

/**
 * Retrieve the top-K embedding chunks for this portfolio, ranked by
 * cosine similarity to `queryEmbedding`.
 *
 * Ties are broken deterministically (id ASC) so tests don't flake.
 */
export async function retrieveTopK(
  portfolioId: string,
  queryEmbedding: number[],
  k: number = MAX_CONTEXT_CHUNKS
): Promise<RetrievedChunk[]> {
  if (queryEmbedding.length !== EMBEDDING_DIM) {
    // Don't hard-fail — log and still attempt ranking. A mismatch likely
    // means a test provided a short vector; cosine works on the shorter
    // prefix. In production this shouldn't happen.
    // eslint-disable-next-line no-console
    console.warn(
      `[chatbot/retrieve] queryEmbedding length ${queryEmbedding.length} != ${EMBEDDING_DIM}`
    );
  }

  const rows = await db
    .select({
      id: embeddings.id,
      chunkType: embeddings.chunkType,
      chunkText: embeddings.chunkText,
      sourceRef: embeddings.sourceRef,
      embedding: embeddings.embedding,
      metadata: embeddings.metadata,
    })
    .from(embeddings)
    .innerJoin(projects, eq(projects.id, embeddings.projectId))
    .where(and(eq(projects.portfolioId, portfolioId)));

  // Parse DB-stored JSON vectors, then hand the pre-parsed candidates
  // to the shared ranking core.
  const candidates: RankableChunk[] = [];
  for (const row of rows) {
    const vec = parseEmbeddingCell(row.embedding);
    if (!vec) continue;
    candidates.push({
      id: row.id,
      chunkType: (row.chunkType as ChunkType) ?? "fact",
      chunkText: row.chunkText,
      sourceRef: row.sourceRef,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      vector: vec,
    });
  }

  return rankChunks(queryEmbedding, candidates, k);
}
