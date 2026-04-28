/**
 * Phase 9 — `POST /api/chat/message` on the published portfolio.
 *
 * Non-streaming counterpart to `/api/chat/stream`. Same validation +
 * retrieval path, but buffers the full Llama response and returns it as
 * a single JSON payload. Kept for client fallback paths where SSE is
 * unavailable (some older browsers, strict proxies).
 *
 * Wire contract matches the builder's `/api/chatbot/message`:
 *   200: { reply: string, sessionId: string }
 *   4xx/5xx: ChatMessageErrorBody
 */

/// <reference types="@cloudflare/workers-types" />

import { rankChunks } from "../../_shared/retrieve";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../../_shared/prompt";
import {
  embedQuery,
  iterateTokens,
  runGeneration,
  type Env,
} from "../../_shared/workers-ai";
import {
  MAX_HISTORY_MESSAGES,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_VISITOR_MESSAGE_CHARS,
  type ChatMessageErrorBody,
  type ChatMessageResponse,
} from "../../_shared/types";
import {
  EMBEDDINGS,
  OWNER_NAME,
  PORTFOLIO_ID,
} from "../../_shared/embeddings";

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Phase E8g — same parser as `stream.ts :: parseHistory`. Inlined
 * here rather than imported because the CF Functions module graph
 * gets bundled per-route and a shared helper file keeps both routes'
 * bundles smaller.
 */
interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}
function parseHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const role = e.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = typeof e.content === "string" ? e.content.trim() : "";
    if (!content) continue;
    out.push({
      role,
      content:
        content.length > MAX_HISTORY_MESSAGE_CHARS
          ? content.slice(0, MAX_HISTORY_MESSAGE_CHARS)
          : content,
    });
  }
  if (out.length > MAX_HISTORY_MESSAGES) {
    return out.slice(-MAX_HISTORY_MESSAGES);
  }
  return out;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json<ChatMessageErrorBody>(400, {
      error: "Invalid JSON body",
      code: "bad_request",
    });
  }

  if (!raw || typeof raw !== "object") {
    return json<ChatMessageErrorBody>(400, {
      error: "Invalid body",
      code: "bad_request",
    });
  }
  const body = raw as Record<string, unknown>;
  const portfolioId =
    typeof body.portfolioId === "string" ? body.portfolioId : "";
  const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!portfolioId || !visitorId || !message) {
    return json<ChatMessageErrorBody>(400, {
      error: "portfolioId, visitorId, and message are required",
      code: "bad_request",
    });
  }
  if (message.length > MAX_VISITOR_MESSAGE_CHARS) {
    return json<ChatMessageErrorBody>(400, {
      error: `message too long (max ${MAX_VISITOR_MESSAGE_CHARS} chars)`,
      code: "bad_request",
    });
  }
  if (portfolioId !== PORTFOLIO_ID) {
    return json<ChatMessageErrorBody>(404, {
      error: "Portfolio mismatch",
      code: "not_found",
    });
  }

  // Phase E8g — optional history for session continuity. Same shape +
  // limits as /api/chat/stream so the two endpoints behave identically
  // for a client that falls back from SSE to JSON mid-session.
  const history = parseHistory(body.history);

  // Retrieval + generation — serial, buffered.
  let queryVec: number[];
  try {
    queryVec = await embedQuery(env, message);
  } catch {
    return json<ChatMessageErrorBody>(503, {
      error:
        "Chatbot is not configured on this site — Workers AI binding missing.",
      code: "not_configured",
    });
  }

  const chunks = rankChunks(queryVec, EMBEDDINGS);
  const systemPrompt = buildSystemPrompt({ ownerName: OWNER_NAME });
  const userPrompt = buildUserPrompt(chunks, message);

  let buffered = "";
  try {
    const stream = await runGeneration(env, [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: userPrompt },
    ]);
    for await (const token of iterateTokens(stream)) {
      buffered += token;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chatbot call failed";
    return json<ChatMessageErrorBody>(500, {
      error: msg,
      code: "internal",
    });
  }

  return json<ChatMessageResponse>(200, {
    reply: buffered,
    sessionId: crypto.randomUUID(),
  });
};
