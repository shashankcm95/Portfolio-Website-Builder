/**
 * Phase 9 — SSE framing for the Pages Function chatbot.
 *
 * Copied verbatim from `src/lib/chatbot/stream.ts` so the published-site
 * chatbot emits byte-identical frames to the builder-side chatbot. Same
 * sse-client in the embedded iframe parses both paths interchangeably.
 *
 * Parity covered by `tests/unit/chatbot/cf-port-parity.test.ts`.
 */

import type { SseFrame } from "./types";

export const SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8";

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": SSE_CONTENT_TYPE,
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function encodeToken(text: string): string {
  return `event: token\ndata: ${JSON.stringify({ text })}\n\n`;
}

export function encodeDone(sessionId: string): string {
  return `event: done\ndata: ${JSON.stringify({ sessionId })}\n\n`;
}

export function encodeError(code: string, error: string): string {
  return `event: error\ndata: ${JSON.stringify({ code, error })}\n\n`;
}

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

/**
 * Build a `ReadableStream<Uint8Array>` from an async iterable of string
 * frames. Handles encoding + terminal-error emission on generator throw.
 * Drop-in equivalent to the builder's `toSseResponseBody`.
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
