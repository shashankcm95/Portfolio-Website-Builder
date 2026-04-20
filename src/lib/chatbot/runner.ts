/**
 * Phase 5.1 — Shared pre-flight + persistence for both chatbot routes.
 *
 * The visitor `/api/chatbot/message` (non-streaming) and `/api/chatbot/stream`
 * (SSE) share everything up to the LLM call:
 *
 *   body parse → rate-limit → publish gate → LLM resolve → embed → retrieve
 *
 * …and the session-persistence step afterwards. Only the middle "how do we
 * deliver the reply to the client" step differs. This module hosts the
 * shared halves so the two route handlers are thin.
 *
 * Error outcomes are returned as typed `PreflightError` values (status +
 * body) instead of being thrown. The caller serializes them into the
 * right wire format (JSON for /message, *same* JSON for /stream since
 * pre-stream errors are a normal HTTP response).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chatbotSessions,
  deployments,
  portfolios,
  visitorEvents,
} from "@/lib/db/schema";
import { getLlmClientForUser } from "@/lib/ai/providers/factory";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
  type LlmClient,
} from "@/lib/ai/providers/types";
import { generateEmbedding } from "@/lib/ai/openai";
import { retrieveTopK } from "./retrieve";
import { check, visitorKey } from "./rate-limit";
import {
  MAX_CONTEXT_CHUNKS,
  MAX_VISITOR_MESSAGE_CHARS,
  type ChatMessage,
  type ChatMessageErrorBody,
  type RetrievedChunk,
} from "./types";

// ─── Body validation ────────────────────────────────────────────────────────

export interface ParsedChatBody {
  portfolioId: string;
  visitorId: string;
  message: string;
}

/**
 * Parse + validate the chat request body. Returns either the parsed
 * shape or a human-readable error string (used in the 400 response).
 */
export function parseChatBody(raw: unknown): ParsedChatBody | string {
  if (!raw || typeof raw !== "object") return "Body must be an object";
  const b = raw as Record<string, unknown>;

  if (typeof b.portfolioId !== "string" || b.portfolioId.length < 1)
    return "portfolioId is required";
  if (typeof b.visitorId !== "string" || b.visitorId.length < 1)
    return "visitorId is required";
  if (typeof b.message !== "string") return "message is required";

  const message = b.message.trim();
  if (message.length === 0) return "message cannot be empty";
  if (message.length > MAX_VISITOR_MESSAGE_CHARS) {
    return `message exceeds ${MAX_VISITOR_MESSAGE_CHARS} characters`;
  }

  return { portfolioId: b.portfolioId, visitorId: b.visitorId, message };
}

// ─── Preflight ──────────────────────────────────────────────────────────────

export interface PreflightError {
  status: number;
  body: ChatMessageErrorBody;
}

export interface PreflightReady {
  portfolioRow: typeof portfolios.$inferSelect;
  visitorId: string;
  message: string;
  llm: LlmClient;
  chunks: RetrievedChunk[];
  ownerName: string;
}

export type PreflightResult =
  | { kind: "error"; err: PreflightError }
  | { kind: "ready"; state: PreflightReady };

/**
 * Run body → rate-limit → gate → LLM resolve → embed → retrieve.
 * Returns the shared state for the caller to produce a response.
 *
 * The caller is responsible for:
 *   - extracting the raw request body (parsed from JSON)
 *   - calling `upsertSession` once the reply is final.
 */
export async function runPreflight(
  rawBody: unknown
): Promise<PreflightResult> {
  const parsed = parseChatBody(rawBody);
  if (typeof parsed === "string") {
    return errorResult(400, { error: parsed, code: "bad_request" });
  }
  const { portfolioId, visitorId, message } = parsed;

  // Rate-limit (visitor first, then portfolio).
  const v = check("visitor", visitorKey(portfolioId, visitorId));
  if (!v.allowed) {
    return errorResult(429, {
      error: "Too many messages. Please slow down.",
      code: "rate_limited",
      retryAfterMs: v.retryAfterMs,
    });
  }
  const p = check("portfolio", portfolioId);
  if (!p.allowed) {
    return errorResult(429, {
      error: "This portfolio has reached its daily chat volume.",
      code: "rate_limited",
      retryAfterMs: p.retryAfterMs,
    });
  }

  // Publish gate.
  let portfolioRow: typeof portfolios.$inferSelect | undefined;
  try {
    const [row] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);
    portfolioRow = row;
  } catch {
    return errorResult(500, { error: "Lookup failed", code: "internal" });
  }
  if (!portfolioRow) {
    return errorResult(404, {
      error: "Portfolio not found",
      code: "not_found",
    });
  }
  if (!portfolioRow.chatbotEnabled) {
    return errorResult(404, {
      error: "Chatbot is disabled on this portfolio",
      code: "not_found",
    });
  }
  const [deployment] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(eq(deployments.portfolioId, portfolioId))
    .limit(1);
  if (!deployment) {
    return errorResult(404, {
      error: "Portfolio is not published",
      code: "not_found",
    });
  }

  // Resolve LLM client for the owner.
  let llm: LlmClient;
  try {
    llm = await getLlmClientForUser(portfolioRow.userId);
  } catch (err) {
    if (
      err instanceof LlmNotConfiguredError ||
      err instanceof LlmInvalidKeyError
    ) {
      return errorResult(503, {
        error: "This portfolio's chatbot is not configured",
        code: "not_configured",
      });
    }
    return errorResult(500, { error: "LLM setup failed", code: "internal" });
  }

  // Embed the question.
  let queryVec: number[];
  try {
    queryVec = await generateEmbedding(message);
  } catch {
    return errorResult(503, {
      error: "Chatbot search is not configured",
      code: "not_configured",
    });
  }

  const chunks = await retrieveTopK(portfolioId, queryVec, MAX_CONTEXT_CHUNKS);
  const ownerName = deriveOwnerName(portfolioRow);

  return {
    kind: "ready",
    state: {
      portfolioRow,
      visitorId,
      message,
      llm,
      chunks,
      ownerName,
    },
  };
}

// ─── Session persistence ────────────────────────────────────────────────────

/**
 * Find the existing session for (portfolio, visitor) and append the new
 * messages; else insert a fresh row. Returns the session id. Callers
 * should wrap this in try/catch and tolerate failure (the visitor
 * already has their reply; we don't fail their response on a DB hiccup).
 */
export async function upsertSession(
  portfolioId: string,
  visitorId: string,
  toAppend: ChatMessage[],
  userAgent: string | null,
  now: Date = new Date()
): Promise<string> {
  const [existing] = await db
    .select()
    .from(chatbotSessions)
    .where(
      and(
        eq(chatbotSessions.portfolioId, portfolioId),
        eq(chatbotSessions.visitorId, visitorId)
      )
    )
    .limit(1);

  if (existing) {
    const prior = Array.isArray(existing.messages)
      ? (existing.messages as ChatMessage[])
      : [];
    await db
      .update(chatbotSessions)
      .set({ messages: [...prior, ...toAppend], updatedAt: now })
      .where(eq(chatbotSessions.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(chatbotSessions)
    .values({
      portfolioId,
      visitorId,
      messages: toAppend,
      metadata: {
        userAgent: userAgent ?? undefined,
        firstSeenAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: chatbotSessions.id });

  return inserted.id;
}

/**
 * Phase 6 — Record a `chatbot_message` event for the portfolio's
 * analytics. Fire-and-forget; a slow insert shouldn't block the reply.
 * Call AFTER a successful chat turn so we never double-count failed
 * attempts.
 */
export async function recordChatbotEvent(
  portfolioId: string,
  userAgent: string | null,
  country: string | null
): Promise<void> {
  try {
    await db.insert(visitorEvents).values({
      portfolioId,
      eventType: "chatbot_message",
      path: null,
      referrer: null,
      userAgentBucket: bucketFromUserAgent(userAgent),
      country,
    });
  } catch {
    // Non-fatal. Analytics dropouts are strictly worse than failed chats.
  }
}

/**
 * Cheap inline bucketing — avoids importing the analytics beacon
 * helpers (which lives in a different module) just for this one call.
 * Matches the categories used by `/api/events/track`.
 */
function bucketFromUserAgent(ua: string | null): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|preview|headless/.test(s)) return "bot";
  if (/mobile|iphone|android/.test(s)) return "mobile";
  if (/windows|macintosh|linux|cros/.test(s)) return "desktop";
  return "other";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function deriveOwnerName(
  row: typeof portfolios.$inferSelect
): string {
  const pd = (row.profileData as Record<string, unknown> | null) ?? {};
  const basics = (pd.basics as Record<string, unknown> | undefined) ?? {};
  if (typeof basics.name === "string" && basics.name.trim()) {
    return basics.name.trim();
  }
  return row.name || "the owner";
}

function errorResult(
  status: number,
  body: ChatMessageErrorBody
): PreflightResult {
  return { kind: "error", err: { status, body } };
}
