/**
 * @jest-environment node
 *
 * Unit tests for the SSE parser in `src/lib/chatbot/sse-client.ts`.
 *
 * `handleFrame` is the pure parsing primitive — tested directly.
 * `streamChat` is driven via a stubbed `fetch` that returns a
 * hand-crafted ReadableStream, exercising chunk-boundary edge cases.
 */

import {
  handleFrame,
  streamChat,
  StreamError,
  StreamHttpError,
} from "@/lib/chatbot/sse-client";

// ─── handleFrame (pure) ─────────────────────────────────────────────────────

describe("handleFrame", () => {
  const collect = () => {
    const got: string[] = [];
    return { got, onToken: (t: string) => got.push(t) };
  };

  it("invokes onToken for token frames", () => {
    const { got, onToken } = collect();
    const r = handleFrame('event: token\ndata: {"text":"hi"}', { onToken });
    expect(r).toEqual({ kind: "token" });
    expect(got).toEqual(["hi"]);
  });

  it("returns done with sessionId", () => {
    const r = handleFrame('event: done\ndata: {"sessionId":"s-1"}', {
      onToken: () => {},
    });
    expect(r).toEqual({ kind: "done", sessionId: "s-1" });
  });

  it("returns error with code + message", () => {
    const r = handleFrame(
      'event: error\ndata: {"code":"internal","error":"boom"}',
      { onToken: () => {} }
    );
    expect(r).toEqual({ kind: "error", code: "internal", error: "boom" });
  });

  it("skips frames with unknown event types", () => {
    expect(
      handleFrame('event: heartbeat\ndata: {}', { onToken: () => {} })
    ).toEqual({ kind: "skip" });
  });

  it("skips malformed JSON payloads", () => {
    expect(
      handleFrame("event: token\ndata: not-json{", { onToken: () => {} })
    ).toEqual({ kind: "skip" });
  });

  it("skips frames without an event: line", () => {
    expect(
      handleFrame('data: {"text":"orphan"}', { onToken: () => {} })
    ).toEqual({ kind: "skip" });
  });

  it("does NOT invoke onToken for empty token text", () => {
    const { got, onToken } = collect();
    handleFrame('event: token\ndata: {"text":""}', { onToken });
    expect(got).toEqual([]);
  });

  it("allows exactly one leading space after 'data:' per spec", () => {
    const { got, onToken } = collect();
    handleFrame('event: token\ndata: {"text":"spaced"}', { onToken });
    expect(got).toEqual(["spaced"]);
  });
});

// ─── streamChat (integration with a stubbed fetch) ─────────────────────────

function stubbedFetch(
  status: number,
  chunks: string[] | null,
  jsonBody?: unknown
): typeof globalThis.fetch {
  return jest.fn(async () => {
    if (status >= 400) {
      return new Response(JSON.stringify(jsonBody ?? { error: "nope" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response;
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks ?? []) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/event-stream" },
    }) as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("streamChat", () => {
  it("concatenates tokens and resolves on done", async () => {
    global.fetch = stubbedFetch(200, [
      'event: token\ndata: {"text":"he"}\n\n',
      'event: token\ndata: {"text":"llo"}\n\n',
      'event: done\ndata: {"sessionId":"s-1"}\n\n',
    ]);
    const got: string[] = [];
    const out = await streamChat(
      "http://t/x",
      { msg: "hi" },
      { onToken: (t) => got.push(t) }
    );
    expect(out.sessionId).toBe("s-1");
    expect(got.join("")).toBe("hello");
  });

  it("handles a frame split across chunk boundaries", async () => {
    global.fetch = stubbedFetch(200, [
      'event: tok',
      'en\ndata: {"text',
      '":"hi"}\n\n',
      'event: done\ndata: {"sessionId":"s-2"}\n\n',
    ]);
    const got: string[] = [];
    const out = await streamChat(
      "http://t/x",
      {},
      { onToken: (t) => got.push(t) }
    );
    expect(got).toEqual(["hi"]);
    expect(out.sessionId).toBe("s-2");
  });

  it("rejects with StreamError on a server error frame", async () => {
    global.fetch = stubbedFetch(200, [
      'event: token\ndata: {"text":"partial"}\n\n',
      'event: error\ndata: {"code":"internal","error":"boom"}\n\n',
    ]);
    const got: string[] = [];
    await expect(
      streamChat("http://t/x", {}, { onToken: (t) => got.push(t) })
    ).rejects.toBeInstanceOf(StreamError);
    // Partial token already delivered before the error
    expect(got).toEqual(["partial"]);
  });

  it("rejects with StreamHttpError on a non-2xx pre-stream response", async () => {
    global.fetch = stubbedFetch(
      429,
      null,
      { code: "rate_limited", error: "slow down", retryAfterMs: 5000 }
    );
    try {
      await streamChat("http://t/x", {}, { onToken: () => {} });
      fail("expected StreamHttpError");
    } catch (e) {
      expect(e).toBeInstanceOf(StreamHttpError);
      expect((e as StreamHttpError).status).toBe(429);
      expect((e as StreamHttpError).body).toMatchObject({
        code: "rate_limited",
      });
    }
  });

  it("handles a final frame without trailing blank line", async () => {
    global.fetch = stubbedFetch(200, [
      'event: token\ndata: {"text":"done"}\n\n',
      'event: done\ndata: {"sessionId":"s-3"}',
      // No trailing \n\n — server closed abruptly.
    ]);
    const got: string[] = [];
    const out = await streamChat(
      "http://t/x",
      {},
      { onToken: (t) => got.push(t) }
    );
    expect(got).toEqual(["done"]);
    expect(out.sessionId).toBe("s-3");
  });
});
