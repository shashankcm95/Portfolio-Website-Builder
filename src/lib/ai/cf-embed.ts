/**
 * Phase 9 — BGE embedding via Cloudflare Workers AI REST API, driven from
 * the builder at publish time.
 *
 * The published portfolio's self-hosted chatbot ranks a BGE-embedded
 * corpus against a BGE-embedded query. The corpus is produced here: each
 * chunk's text is sent to `@cf/baai/bge-base-en-v1.5` via
 * `POST /accounts/{id}/ai/run/@cf/baai/bge-base-en-v1.5` using the
 * existing `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` env vars.
 *
 * Two correctness properties this module upholds:
 *
 *   1. **Caching by content hash.** Unchanged chunks skip re-embedding
 *      on subsequent publishes. Hash = SHA-256(chunkText). Cache lives
 *      in the `embeddings.embedding_bge` jsonb column as
 *      `{ hash: string; vector: number[] }`. First-ever publish for a
 *      portfolio of 200 chunks: ~15s. Subsequent publish with 2 changed
 *      chunks: <1s.
 *
 *   2. **Best-effort — never blocks the publish.** If a chunk fails to
 *      embed (rate limit, transient 5xx), that chunk is dropped from
 *      the corpus with a warning. The publish still succeeds; the
 *      chatbot just has fewer chunks to retrieve against.
 */

import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { embeddings, projects } from "@/lib/db/schema";
import type { ChunkType } from "@/lib/chatbot/types";
import { logger } from "@/lib/log";

/** BGE-base-en-v1.5 dimensionality. */
export const BGE_DIMENSIONS = 768;

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const BGE_MODEL = "@cf/baai/bge-base-en-v1.5";

export interface BgeEmbeddedChunk {
  id: string;
  chunkType: ChunkType;
  chunkText: string;
  sourceRef: string | null;
  metadata: Record<string, unknown>;
  vector: number[];
}

/** Stored cache shape in `embeddings.embedding_bge`. */
interface CachedBge {
  hash: string;
  vector: number[];
}

/**
 * Compute the BGE-embedded corpus for this portfolio. Reads every
 * embedding row via `projects.portfolioId`, consults the per-row
 * `embedding_bge` cache, re-embeds only the stale ones, and writes the
 * fresh vectors back to the DB before returning the full result.
 *
 * Caller (the chatbot bundler) feeds the result into the static
 * `functions/_shared/embeddings.ts` module written into the Pages
 * output.
 */
export async function embedCorpusForPortfolio(
  portfolioId: string
): Promise<BgeEmbeddedChunk[]> {
  // 1. Load every embedding row for this portfolio in one query.
  const rows = await db
    .select({
      id: embeddings.id,
      chunkType: embeddings.chunkType,
      chunkText: embeddings.chunkText,
      sourceRef: embeddings.sourceRef,
      metadata: embeddings.metadata,
      embeddingBge: embeddings.embeddingBge,
    })
    .from(embeddings)
    .innerJoin(projects, eq(projects.id, embeddings.projectId))
    .where(eq(projects.portfolioId, portfolioId));

  if (rows.length === 0) return [];

  // 2. Split into hit (cache valid) + miss (needs re-embed).
  const out: BgeEmbeddedChunk[] = [];
  const stale: Array<{ id: string; text: string; hash: string }> = [];

  for (const row of rows) {
    const hash = contentHash(row.chunkText);
    const cached = parseCachedBge(row.embeddingBge);

    if (cached && cached.hash === hash && cached.vector.length === BGE_DIMENSIONS) {
      out.push({
        id: row.id,
        chunkType: (row.chunkType as ChunkType) ?? "fact",
        chunkText: row.chunkText,
        sourceRef: row.sourceRef,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        vector: cached.vector,
      });
    } else {
      stale.push({ id: row.id, text: row.chunkText, hash });
    }
  }

  // 3. Re-embed stale chunks via Workers AI REST. Dropped chunks on
  //    fetch failure are logged but don't abort the publish.
  if (stale.length > 0) {
    const fresh = await embedBatch(stale.map((s) => s.text));
    for (let i = 0; i < stale.length; i++) {
      const vector = fresh[i];
      if (!vector) continue;
      const rowInfo = stale[i];
      const orig = rows.find((r) => r.id === rowInfo.id);
      if (!orig) continue;
      out.push({
        id: orig.id,
        chunkType: (orig.chunkType as ChunkType) ?? "fact",
        chunkText: orig.chunkText,
        sourceRef: orig.sourceRef,
        metadata: (orig.metadata as Record<string, unknown> | null) ?? {},
        vector,
      });
    }

    // 4. Persist the fresh cache. One update per row — not bulk — because
    //    embedding_bge is jsonb and Drizzle doesn't support batch updates
    //    on different jsonb payloads in a single statement. ~200 updates
    //    for a worst-case full recompute is still well under 1s.
    const ids = stale
      .map((s, i) => (fresh[i] ? s.id : null))
      .filter((x): x is string => x !== null);
    await Promise.all(
      ids.map((id, idx) => {
        const vector = fresh[idx];
        const hash = stale.find((s) => s.id === id)?.hash ?? "";
        if (!vector || !hash) return Promise.resolve();
        const payload: CachedBge = { hash, vector };
        return db
          .update(embeddings)
          .set({ embeddingBge: payload })
          .where(inArray(embeddings.id, [id]));
      })
    );
  }

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseCachedBge(raw: unknown): CachedBge | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.hash !== "string") return null;
  if (!Array.isArray(obj.vector)) return null;
  if (obj.vector.some((v) => typeof v !== "number")) return null;
  return { hash: obj.hash, vector: obj.vector as number[] };
}

/**
 * Embed a batch of texts via Workers AI REST. Returns `null` for any
 * entry whose embedding failed, so index-by-index alignment with the
 * input is preserved. Splits into API-friendly sub-batches (100/call)
 * and surfaces aggregated warnings.
 */
async function embedBatch(
  texts: string[]
): Promise<Array<number[] | null>> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    logger.warn(
      "[cf-embed] CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN not set; skipping BGE embedding — baked corpus will be empty."
    );
    return texts.map(() => null);
  }

  const results: Array<number[] | null> = new Array(texts.length).fill(null);
  const BATCH = 100;

  for (let offset = 0; offset < texts.length; offset += BATCH) {
    const slice = texts.slice(offset, offset + BATCH);
    try {
      const vectors = await runBgeOnce(slice);
      for (let i = 0; i < vectors.length; i++) {
        results[offset + i] = vectors[i] ?? null;
      }
    } catch (err) {
      logger.warn("[cf-embed] Workers AI batch failed; dropping chunks", {
        batchStart: offset,
        batchEnd: offset + slice.length,
        dropped: slice.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Leave these indexes as null — they get dropped upstream.
    }
  }

  return results;
}

/**
 * One Workers AI REST call. Returns a vector per input. Throws on any
 * non-success response so the batching layer can log + drop cleanly.
 */
async function runBgeOnce(texts: string[]): Promise<number[][]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${BGE_MODEL}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 401
        ? " (token missing Workers AI scope?)"
        : res.status === 404
          ? " (account id wrong or Workers AI not enabled?)"
          : "";
    throw new Error(`BGE ${res.status}${hint}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    result?: { data?: number[][]; shape?: number[] };
    errors?: Array<{ message?: string }>;
  };
  if (!json.success) {
    const msg =
      json.errors?.[0]?.message ?? "Workers AI returned success=false";
    throw new Error(`BGE call rejected: ${msg}`);
  }
  const data = json.result?.data;
  if (!Array.isArray(data)) {
    throw new Error("BGE response missing result.data");
  }
  return data;
}
