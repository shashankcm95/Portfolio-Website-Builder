/**
 * Phase 5.1 — Streaming visitor chat endpoint (SSE).
 *
 * POST /api/chatbot/stream
 *   body: { portfolioId, visitorId, message }
 *
 * Success: `200 text/event-stream` with a sequence of:
 *   event: token  data: {"text":"…"}
 *   event: token  data: {"text":"…"}
 *   event: done   data: {"sessionId":"…"}
 *
 * Mid-stream failure: one `event: error` frame, no trailing `done`.
 *
 * Pre-stream errors (bad body, rate limit, publish gate, LLM missing) are
 * normal HTTP responses with a JSON body — same shape as /api/chatbot/message
 * so the client's `fetch` branch is identical.
 *
 * Node runtime required for `ReadableStream` + the provider SDKs' streaming
 * iterators. Edge runtime would work, but `@anthropic-ai/sdk` pulls in some
 * Node-only deps; staying on Node avoids surprises.
 */

export const runtime = "nodejs";

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
import {
  SSE_HEADERS,
  encodeDone,
  encodeError,
  encodeToken,
  toSseResponseBody,
} from "@/lib/chatbot/stream";
import type {
  ChatMessage,
  ChatMessageErrorBody,
} from "@/lib/chatbot/types";

function errorJson(status: number, body: ChatMessageErrorBody) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  // Parse the JSON body up front — malformed JSON short-circuits before
  // any streaming happens, so we can return a normal 400.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson(400, { error: "Invalid JSON body", code: "bad_request" });
  }

  const pre = await runPreflight(raw);
  if (pre.kind === "error") {
    return errorJson(pre.err.status, pre.err.body);
  }
  const {
    portfolioRow,
    visitorId,
    message,
    llm,
    chunks,
    ownerName,
  } = pre.state;

  const systemPrompt = buildSystemPrompt({
    ownerName,
    portfolioName: portfolioRow.name,
  });
  const userPrompt = buildUserPrompt(chunks, message);
  const userAgent = req.headers.get("user-agent") ?? null;
  const country = req.headers.get("cf-ipcountry") ?? null;
  const portfolioId = portfolioRow.id;

  // Build the async frame generator. We BUFFER the reply while streaming
  // tokens so we can persist the full transcript once `done` fires.
  async function* frames(): AsyncGenerator<string, void, unknown> {
    let buffered = "";
    try {
      for await (const chunk of llm.textStream({
        systemPrompt,
        userPrompt,
        maxTokens: 600,
        temperature: 0.2, // §17 — low temp tightens scope discipline.
      })) {
        if (!chunk) continue;
        buffered += chunk;
        yield encodeToken(chunk);
      }
    } catch (err) {
      const code =
        err instanceof LlmInvalidKeyError ? "not_configured" : "internal";
      const message =
        err instanceof Error ? err.message : "LLM streaming failed";
      // eslint-disable-next-line no-console
      console.error("[chatbot/stream] LLM failed:", err);
      yield encodeError(code, message);
      return; // No `done` after `error`.
    }

    const reply =
      buffered.trim() ||
      "I don't have a good answer to that — try asking about a specific project.";

    // Persist the transcript. Non-fatal — if it throws we still want to
    // finalize the stream with a synthetic session id so the client UX
    // completes cleanly.
    const now = new Date();
    const nowIso = now.toISOString();
    const toAppend: ChatMessage[] = [
      { role: "user", content: message, createdAt: nowIso },
      { role: "assistant", content: reply, createdAt: nowIso },
    ];

    let sessionId: string;
    try {
      sessionId = await upsertSession(
        portfolioId,
        visitorId,
        toAppend,
        userAgent,
        now
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[chatbot/stream] session upsert failed:", err);
      sessionId = `synthetic-${Date.now()}`;
    }

    // Phase 6 — analytics event for the Analytics tab. Non-fatal.
    recordChatbotEvent(portfolioId, userAgent, country);

    yield encodeDone(sessionId);
  }

  return new Response(toSseResponseBody(frames()), {
    status: 200,
    headers: SSE_HEADERS,
  });
}
