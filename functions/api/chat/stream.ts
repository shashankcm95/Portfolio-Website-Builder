/**
 * Phase 9 — `POST /api/chat/stream` on the published portfolio.
 *
 * Cloudflare Pages Function. Runs on Cloudflare's edge at the same
 * origin as the static site. Replaces the builder's
 * `/api/chatbot/stream` for visitors of portfolios that opted into
 * self-hosting.
 *
 * Flow:
 *   1. Parse + validate the request body.
 *   2. Embed the visitor's message via Workers AI (BGE-base-en-v1.5).
 *   3. Rank the baked EMBEDDINGS corpus by cosine similarity → top-8.
 *   4. Compose the visitor system + user prompt.
 *   5. Stream Llama 3.1 8B's tokens back as SSE frames in the same wire
 *      format the existing embed UI already parses.
 *
 * Wire contract: byte-for-byte compatible with the builder's
 * `/api/chatbot/stream` (see `tests/unit/chatbot/cf-port-parity.test.ts`).
 *
 * No database, no API keys, no rate-limit state. Rate limiting is handled
 * by Cloudflare WAF rules provisioned at deploy time. A visitor-scoped
 * limit is not enforced here — the WAF blanket (~20 req/min/IP) is the
 * MVP defense. Per-visitor quotas can be added via Durable Objects later.
 */

/// <reference types="@cloudflare/workers-types" />

import { rankChunks } from "../../_shared/retrieve";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../../_shared/prompt";
import {
  SSE_HEADERS,
  encodeDone,
  encodeError,
  encodeToken,
  toSseResponseBody,
} from "../../_shared/stream";
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
} from "../../_shared/types";
import {
  EMBEDDINGS,
  OWNER_NAME,
  PORTFOLIO_ID,
} from "../../_shared/embeddings";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ParsedBody {
  portfolioId: string;
  visitorId: string;
  message: string;
  /**
   * Phase E8g — prior conversation turns the client is replaying for
   * session continuity. Empty / absent for the first message of a
   * session. Capped at MAX_HISTORY_MESSAGES entries server-side.
   */
  history: HistoryMessage[];
}

function errorJson(
  status: number,
  body: ChatMessageErrorBody
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function validateBody(raw: unknown): ParsedBody | ChatMessageErrorBody {
  if (!raw || typeof raw !== "object") {
    return { error: "Invalid JSON body", code: "bad_request" };
  }
  const body = raw as Record<string, unknown>;
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : "";
  const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!portfolioId || !visitorId || !message) {
    return {
      error: "portfolioId, visitorId, and message are required",
      code: "bad_request",
    };
  }
  if (message.length > MAX_VISITOR_MESSAGE_CHARS) {
    return {
      error: `message too long (max ${MAX_VISITOR_MESSAGE_CHARS} chars)`,
      code: "bad_request",
    };
  }
  // Hard-stop mismatched portfolio ids. The embed widget bakes the right
  // one; if a malicious caller tampers, refuse rather than leak context
  // from a different portfolio (there is only one corpus baked in, but
  // the caller doesn't need to know that).
  if (portfolioId !== PORTFOLIO_ID) {
    return { error: "Portfolio mismatch", code: "not_found" };
  }
  // Phase E8g — optional history for session continuity. We validate
  // shape + cap the size server-side so a misbehaving client can't
  // blow the model's input budget.
  const history = parseHistory(body.history);
  return { portfolioId, visitorId, message, history };
}

/**
 * Phase E8g — coerce the `history` field into a clean array of
 * `{role, content}`. Drops any entry that doesn't match the contract;
 * truncates oversize content; caps total length to
 * `MAX_HISTORY_MESSAGES`. Always returns an array (empty when input is
 * missing or all-malformed) so the caller doesn't have to branch.
 */
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
    const trimmed =
      content.length > MAX_HISTORY_MESSAGE_CHARS
        ? content.slice(0, MAX_HISTORY_MESSAGE_CHARS)
        : content;
    out.push({ role, content: trimmed });
  }
  // Keep the most recent N — older turns matter less and we don't want
  // a misbehaving client to stuff the budget.
  if (out.length > MAX_HISTORY_MESSAGES) {
    return out.slice(-MAX_HISTORY_MESSAGES);
  }
  return out;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Parse body up front so malformed JSON returns a normal 400 rather
  // than a half-opened SSE stream.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson(400, { error: "Invalid JSON body", code: "bad_request" });
  }

  const validated = validateBody(raw);
  if ("error" in validated) {
    const status = validated.code === "not_found" ? 404 : 400;
    return errorJson(status, validated);
  }
  const { message, history } = validated;

  // Embed the visitor message + rank the baked corpus. Done before we
  // open the stream so a Workers-AI misconfig returns a clean JSON 503.
  let queryVec: number[];
  try {
    queryVec = await embedQuery(env, message);
  } catch (err) {
    return errorJson(503, {
      error:
        "Chatbot is not configured on this site — Workers AI binding missing.",
      code: "not_configured",
    });
  }

  const chunks = rankChunks(queryVec, EMBEDDINGS);
  const systemPrompt = buildSystemPrompt({ ownerName: OWNER_NAME });
  const userPrompt = buildUserPrompt(chunks, message);

  // Generation: stream Workers AI tokens, re-frame into our SSE format.
  // A session id is not persisted here (no DB); emit a synthetic uuid
  // for the `done` frame so clients that expect one keep working.
  const sessionId = crypto.randomUUID();

  async function* frames(): AsyncGenerator<string, void, unknown> {
    try {
      // Phase E8g — replay session history before the current turn so
      // the model can resolve "his" / "those projects" / etc. The
      // <context> block is attached only to the current user turn:
      // the model uses retrieval against THIS message, but uses prior
      // turns purely for conversational reference. Re-attaching
      // <context> on every prior user turn would explode the input
      // budget without improving answer quality.
      const stream = await runGeneration(env, [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: userPrompt },
      ]);
      for await (const token of iterateTokens(stream)) {
        if (token) yield encodeToken(token);
      }
      yield encodeDone(sessionId);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Chatbot stream failed";
      yield encodeError("internal", msg);
    }
  }

  return new Response(toSseResponseBody(frames()), {
    status: 200,
    headers: SSE_HEADERS,
  });
};
