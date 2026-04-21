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
  MAX_VISITOR_MESSAGE_CHARS,
  type ChatMessageErrorBody,
} from "../../_shared/types";
import {
  EMBEDDINGS,
  OWNER_NAME,
  PORTFOLIO_ID,
} from "../../_shared/embeddings";

interface ParsedBody {
  portfolioId: string;
  visitorId: string;
  message: string;
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
  return { portfolioId, visitorId, message };
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
  const { message } = validated;

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
      const stream = await runGeneration(env, [
        { role: "system", content: systemPrompt },
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
