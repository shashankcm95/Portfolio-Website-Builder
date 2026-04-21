/**
 * Phase 9 — Embeddings corpus template.
 *
 * This file is a template. At publish time, `src/lib/generator/chatbot
 * -bundle.ts` emits a concrete `functions/_shared/embeddings.ts` into
 * the Pages deploy output directory with:
 *
 *   - `EMBEDDINGS: ChunkRow[]` — all of the portfolio's chunks with BGE
 *     768-dim vectors inlined.
 *   - `OWNER_NAME: string` — baked for the visitor prompt builder.
 *   - `PORTFOLIO_ID: string` — used in the `done` SSE frame + telemetry.
 *   - `GREETING: string | null` / `STARTERS: string[]` — picked up by the
 *     static `chat.html` widget. The Function itself doesn't read them.
 *
 * This file exists so (a) TypeScript in the builder repo knows the module
 * shape for unit tests, and (b) the bundler has a stable source to write
 * to. It should NEVER be imported directly by the functions/ tree — the
 * bundler emits `embeddings.ts` alongside this template and the Function
 * imports THAT.
 */

import type { ChunkRow } from "./types";

export interface ChatbotBundleMetadata {
  ownerName: string;
  portfolioId: string;
  greeting: string | null;
  starters: string[];
  /** ISO-8601 timestamp of when this bundle was generated. */
  generatedAt: string;
}

/** Placeholder — replaced at publish time. */
export const EMBEDDINGS: ChunkRow[] = [];

/** Placeholder — replaced at publish time. */
export const OWNER_NAME: string = "";

/** Placeholder — replaced at publish time. */
export const PORTFOLIO_ID: string = "";

/** Placeholder — replaced at publish time. */
export const GREETING: string | null = null;

/** Placeholder — replaced at publish time. */
export const STARTERS: string[] = [];

/** Placeholder — replaced at publish time. */
export const GENERATED_AT: string = "";
