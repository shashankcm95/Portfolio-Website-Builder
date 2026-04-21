/**
 * Phase 9 — RAG retrieval inside the Pages Function.
 *
 * Mirror of `src/lib/chatbot/retrieve.ts`'s pure ranking core. The builder-
 * side file does the same work against DB rows; here we rank against the
 * pre-embedded `EMBEDDINGS` array baked into the deploy at publish time.
 *
 * A parity unit test (`tests/unit/chatbot/cf-port-parity.test.ts`) feeds
 * the same inputs to both files' `rankChunks` and asserts identical
 * output. If you edit cosine or ranking here, edit the builder copy in
 * the same commit or CI fails.
 */

import {
  MAX_CONTEXT_CHUNKS,
  type ChunkRow,
  type ChunkType,
  type RetrievedChunk,
} from "./types";

/**
 * Cosine similarity of two equal-length numeric arrays. Returns 0 when
 * either input is zero-length or magnitude-zero. BGE vectors are
 * L2-normalized so magnitudes are ≈1 — we still compute them for safety.
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
 * Rank pre-loaded chunks by cosine similarity to the query vector, return
 * the top-K. Pure function. Ties broken deterministically by id ASC.
 */
export function rankChunks(
  queryEmbedding: number[],
  candidates: readonly ChunkRow[],
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
