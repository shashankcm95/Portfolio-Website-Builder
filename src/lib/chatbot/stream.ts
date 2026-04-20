/**
 * Phase 5.1 — Server-Sent Events framing for the chatbot stream routes.
 *
 * Wire format (plan §Streaming wire format):
 *
 *   event: token
 *   data: {"text":"<chunk>"}\n\n
 *
 *   event: done
 *   data: {"sessionId":"<id>"}\n\n
 *
 *   event: error
 *   data: {"code":"internal","error":"…"}\n\n
 *
 * No trailing `done` after an `error`. This module owns the wire format
 * so both `/api/chatbot/stream` and `/api/chatbot/owner-ask/stream` stay
 * in sync. Tests snapshot the encoder output to lock the format.
 */

import type { SseFrame } from "./types";

/** Content-Type header every SSE response sets. */
export const SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8";

/** Common response headers for an SSE stream. */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": SSE_CONTENT_TYPE,
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx + Cloudflare both honor this) so
  // tokens land in the browser as soon as we flush them.
  "X-Accel-Buffering": "no",
};

// ─── Encoders ───────────────────────────────────────────────────────────────

/** Encode a `token` frame. Text is JSON-escaped. */
export function encodeToken(text: string): string {
  return `event: token\ndata: ${JSON.stringify({ text })}\n\n`;
}

/** Encode the terminal `done` frame. */
export function encodeDone(sessionId: string): string {
  return `event: done\ndata: ${JSON.stringify({ sessionId })}\n\n`;
}

/**
 * Encode a mid-stream `error` frame. After emitting this, the server
 * must close the stream without a `done`. Client treats it as terminal.
 */
export function encodeError(code: string, error: string): string {
  return `event: error\ndata: ${JSON.stringify({ code, error })}\n\n`;
}

/** Catch-all for dynamic frame construction from a typed union. */
export function encodeFrame(frame: SseFrame): string {
  switch (frame.event) {
    case "token":
      return encodeToken(frame.data.text);
    case "done":
      return encodeDone(frame.data.sessionId);
    case "error":
      return encodeError(frame.data.code, frame.data.error);
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Build a `ReadableStream<Uint8Array>` from an async generator that
 * yields string frames. Used by the route handlers to hand a body to
 * `new NextResponse(stream)`. Encodes via UTF-8.
 *
 * On generator error we emit a single `error` frame (code: "internal")
 * before closing — this ensures the client never sees a silent stall.
 */
export function toSseResponseBody(
  frames: AsyncIterable<string>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of frames) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown streaming error";
        controller.enqueue(encoder.encode(encodeError("internal", message)));
      } finally {
        controller.close();
      }
    },
  });
}
