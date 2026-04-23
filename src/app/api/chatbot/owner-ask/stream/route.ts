/**
 * Phase 5.2 — Owner-facing Ask Assistant (SSE streaming).
 *
 * POST /api/chatbot/owner-ask/stream
 *   body: { portfolioId, message, seedContext? }
 *   → 200 text/event-stream (token / done / error frames)
 *   → 400 { error, code: "bad_request" }       malformed / oversize
 *   → 401 { error, code: "unauthorized" }      no session
 *   → 403 { error, code: "forbidden" }         not the portfolio owner
 *   → 404 { error, code: "not_found" }         portfolio missing
 *   → 429 { error, code: "rate_limited", retryAfterMs }
 *   → 503 { error, code: "not_configured" }    no LLM provider
 *
 * Differences from the visitor `/api/chatbot/stream`:
 *   - Auth-gated: session required + ownership check.
 *   - Uses `buildOwnerSystemPrompt()` (permissive) + `buildOwnerUserPrompt()`
 *     (wraps seedContext in <suggestion>).
 *   - Does NOT require the portfolio to be published — owners iterate
 *     on drafts too.
 *   - Does NOT persist to `chatbot_sessions`: owner chats are ephemeral.
 *   - Lighter rate limit (60/10min per user+portfolio).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
  type LlmClient,
} from "@/lib/ai/providers/types";
import { getLlmClientForUser } from "@/lib/ai/providers/factory";
import { generateEmbedding } from "@/lib/ai/openai";
import {
  buildOwnerSystemPrompt,
  buildOwnerUserPrompt,
} from "@/lib/chatbot/prompt";
import { retrieveTopK } from "@/lib/chatbot/retrieve";
import { check } from "@/lib/chatbot/rate-limit";
import {
  SSE_HEADERS,
  encodeDone,
  encodeError,
  encodeToken,
  toSseResponseBody,
} from "@/lib/chatbot/stream";
import {
  MAX_CONTEXT_CHUNKS,
  MAX_VISITOR_MESSAGE_CHARS,
} from "@/lib/chatbot/types";
import { logger } from "@/lib/log";

const MAX_SEED_CONTEXT_CHARS = 2000; // GitHub suggestion titles/descriptions

function errorJson(
  status: number,
  body: { error: string; code: string; retryAfterMs?: number }
) {
  return NextResponse.json(body, { status });
}

interface ParsedOwnerBody {
  portfolioId: string;
  message: string;
  seedContext?: string;
}

function parseBody(raw: unknown): ParsedOwnerBody | string {
  if (!raw || typeof raw !== "object") return "Body must be an object";
  const b = raw as Record<string, unknown>;

  if (typeof b.portfolioId !== "string" || b.portfolioId.length < 1)
    return "portfolioId is required";
  if (typeof b.message !== "string") return "message is required";
  const message = b.message.trim();
  if (message.length === 0) return "message cannot be empty";
  if (message.length > MAX_VISITOR_MESSAGE_CHARS) {
    return `message exceeds ${MAX_VISITOR_MESSAGE_CHARS} characters`;
  }

  let seedContext: string | undefined;
  if (typeof b.seedContext === "string") {
    const trimmed = b.seedContext.trim();
    if (trimmed.length > MAX_SEED_CONTEXT_CHARS) {
      return `seedContext exceeds ${MAX_SEED_CONTEXT_CHARS} characters`;
    }
    seedContext = trimmed.length > 0 ? trimmed : undefined;
  } else if (b.seedContext !== undefined && b.seedContext !== null) {
    return "seedContext must be a string";
  }

  return { portfolioId: b.portfolioId, message, seedContext };
}

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Parse body.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson(400, { error: "Invalid JSON body", code: "bad_request" });
  }
  const parsed = parseBody(raw);
  if (typeof parsed === "string") {
    return errorJson(400, { error: parsed, code: "bad_request" });
  }
  const { portfolioId, message, seedContext } = parsed;

  // 2. Auth.
  const session = await auth();
  if (!session?.user?.id) {
    return errorJson(401, { error: "Unauthorized", code: "unauthorized" });
  }
  const userId = session.user.id;

  // 3. Ownership gate — portfolio must exist AND belong to the caller.
  let portfolioRow: typeof portfolios.$inferSelect | undefined;
  try {
    const [row] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);
    portfolioRow = row;
  } catch {
    return errorJson(500, { error: "Lookup failed", code: "internal" });
  }
  if (!portfolioRow) {
    return errorJson(404, { error: "Portfolio not found", code: "not_found" });
  }
  if (portfolioRow.userId !== userId) {
    return errorJson(403, { error: "Forbidden", code: "forbidden" });
  }

  // 4. Light rate limit keyed by (userId, portfolioId).
  const rl = check("owner", `${userId}:${portfolioId}`);
  if (!rl.allowed) {
    return errorJson(429, {
      error: "Too many Ask Assistant messages — slow down.",
      code: "rate_limited",
      retryAfterMs: rl.retryAfterMs,
    });
  }

  // 5. LLM client.
  let llm: LlmClient;
  try {
    llm = await getLlmClientForUser(userId);
  } catch (err) {
    if (
      err instanceof LlmNotConfiguredError ||
      err instanceof LlmInvalidKeyError
    ) {
      return errorJson(503, {
        error: "No LLM provider is configured for your account",
        code: "not_configured",
      });
    }
    return errorJson(500, { error: "LLM setup failed", code: "internal" });
  }

  // 6. Embed query + retrieve top-K chunks (same corpus as visitor chat).
  let queryVec: number[];
  try {
    queryVec = await generateEmbedding(message);
  } catch {
    return errorJson(503, {
      error: "Embedding API is not configured",
      code: "not_configured",
    });
  }
  const chunks = await retrieveTopK(portfolioId, queryVec, MAX_CONTEXT_CHUNKS);

  // 7. Owner-specific prompts.
  const ownerName = deriveOwnerName(portfolioRow);
  const systemPrompt = buildOwnerSystemPrompt({ ownerName });
  const userPrompt = buildOwnerUserPrompt(chunks, seedContext, message);

  // 8. Stream reply. No session persistence — owner chats are ephemeral.
  async function* frames(): AsyncGenerator<string, void, unknown> {
    try {
      for await (const chunk of llm.textStream({
        systemPrompt,
        userPrompt,
        maxTokens: 800,
        temperature: 0.4, // owner wants concrete, slightly more creative
      })) {
        if (chunk) yield encodeToken(chunk);
      }
    } catch (err) {
      const code =
        err instanceof LlmInvalidKeyError ? "not_configured" : "internal";
      const errMsg = err instanceof Error ? err.message : "Streaming failed";
      // eslint-disable-next-line no-console
      logger.error("[chatbot/owner-ask] LLM failed", { error: err instanceof Error ? err.message : String(err) });
      yield encodeError(code, errMsg);
      return;
    }
    // No sessionId to report — we don't persist.
    yield encodeDone("");
  }

  return new Response(toSseResponseBody(frames()), {
    status: 200,
    headers: SSE_HEADERS,
  });
}

function deriveOwnerName(row: typeof portfolios.$inferSelect): string {
  const pd = (row.profileData as Record<string, unknown> | null) ?? {};
  const basics = (pd.basics as Record<string, unknown> | undefined) ?? {};
  if (typeof basics.name === "string" && basics.name.trim()) {
    return basics.name.trim();
  }
  return row.name || "the owner";
}
