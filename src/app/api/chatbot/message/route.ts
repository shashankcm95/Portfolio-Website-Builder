/**
 * Phase 5 — Visitor chatbot message endpoint (non-streaming).
 *
 * POST /api/chatbot/message
 *   body: { portfolioId, visitorId, message }
 *   → 200 { reply, sessionId }
 *   → 400 { error, code: "bad_request" }          invalid / missing / oversize
 *   → 404 { error, code: "not_found" }            portfolio doesn't exist or
 *                                                 is unpublished / disabled
 *   → 429 { error, code: "rate_limited",          limit exhausted
 *           retryAfterMs }
 *   → 503 { error, code: "not_configured" }       no LLM provider available
 *   → 500 { error, code: "internal" }             anything else
 *
 * Phase 5.1: preflight (parse → rate-limit → gate → LLM resolve → embed →
 * retrieve) + session persistence are shared with /api/chatbot/stream via
 * `src/lib/chatbot/runner.ts`. Only the LLM call itself differs: this
 * route awaits the full reply; the stream route yields tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { LlmInvalidKeyError } from "@/lib/ai/providers/types";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "@/lib/chatbot/prompt";
import {
  runPreflight,
  upsertSession,
  recordChatbotEvent,
} from "@/lib/chatbot/runner";
import type {
  ChatMessage,
  ChatMessageErrorBody,
  ChatMessageResponse,
} from "@/lib/chatbot/types";

function errorResponse(
  status: number,
  body: ChatMessageErrorBody
): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse body (runner handles JSON shape validation; JSON.parse itself
  //    can fail before then with an "Invalid JSON body" 400).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, {
      error: "Invalid JSON body",
      code: "bad_request",
    });
  }

  // 2-6. Preflight: validate → rate-limit → gate → LLM → embed → retrieve.
  const pre = await runPreflight(raw);
  if (pre.kind === "error") {
    return errorResponse(pre.err.status, pre.err.body);
  }
  const {
    portfolioRow,
    visitorId,
    message,
    llm,
    chunks,
    ownerName,
  } = pre.state;

  // 7. Prompt + LLM call.
  const systemPrompt = buildSystemPrompt({
    ownerName,
    portfolioName: portfolioRow.name,
  });
  const userPrompt = buildUserPrompt(chunks, message);

  let reply: string;
  try {
    reply = (
      await llm.text({
        systemPrompt,
        userPrompt,
        maxTokens: 600,
        // Phase 5.2 §17: low temperature tightens scope discipline.
        temperature: 0.2,
      })
    ).trim();
  } catch (err) {
    if (err instanceof LlmInvalidKeyError) {
      return errorResponse(503, {
        error: "This portfolio's chatbot is not configured",
        code: "not_configured",
      });
    }
    // eslint-disable-next-line no-console
    console.error("[chatbot] LLM call failed:", err);
    return errorResponse(500, {
      error: "Something went wrong",
      code: "internal",
    });
  }

  if (!reply) {
    reply = "I don't have a good answer to that — try asking about a specific project.";
  }

  // 8. Upsert session + append transcript.
  const now = new Date();
  const nowIso = now.toISOString();
  const newMessages: ChatMessage[] = [
    { role: "user", content: message, createdAt: nowIso },
    { role: "assistant", content: reply, createdAt: nowIso },
  ];

  let sessionId: string;
  try {
    sessionId = await upsertSession(
      portfolioRow.id,
      visitorId,
      newMessages,
      req.headers.get("user-agent") ?? null,
      now
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[chatbot] session upsert failed:", err);
    sessionId = `synthetic-${Date.now()}`;
  }

  // Phase 6 — record the chatbot turn as a visitor event so it shows up
  // in the owner's Analytics tab. Non-fatal.
  recordChatbotEvent(
    portfolioRow.id,
    req.headers.get("user-agent") ?? null,
    req.headers.get("cf-ipcountry") ?? null
  );

  const resp: ChatMessageResponse = { reply, sessionId };
  return NextResponse.json(resp);
}
