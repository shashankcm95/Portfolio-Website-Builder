/**
 * @jest-environment node
 *
 * Unit tests for the SSE encoders in `src/lib/chatbot/stream.ts`.
 * These lock down the wire format both stream routes emit.
 */

import {
  SSE_CONTENT_TYPE,
  SSE_HEADERS,
  encodeDone,
  encodeError,
  encodeFrame,
  encodeToken,
  toSseResponseBody,
} from "@/lib/chatbot/stream";

describe("encodeToken", () => {
  it("produces a well-formed token frame", () => {
    expect(encodeToken("hello")).toBe(
      'event: token\ndata: {"text":"hello"}\n\n'
    );
  });
  it("JSON-escapes embedded quotes", () => {
    expect(encodeToken('he said "hi"')).toBe(
      'event: token\ndata: {"text":"he said \\"hi\\""}\n\n'
    );
  });
  it("preserves multi-byte UTF-8 content", () => {
    expect(encodeToken("café ☕")).toBe(
      'event: token\ndata: {"text":"café ☕"}\n\n'
    );
  });
  it("handles newlines in the text (JSON-escaped, not bare)", () => {
    const out = encodeToken("line1\nline2");
    // The `data:` line itself must not contain a bare newline — it must
    // end with \n\n only. The content's newline is JSON-escaped as \\n.
    expect(out).toBe('event: token\ndata: {"text":"line1\\nline2"}\n\n');
    // Exactly one frame terminator at the end.
    expect(out.match(/\n\n/g)?.length).toBe(1);
  });
});

describe("encodeDone", () => {
  it("produces a terminal done frame", () => {
    expect(encodeDone("s-abc")).toBe(
      'event: done\ndata: {"sessionId":"s-abc"}\n\n'
    );
  });
});

describe("encodeError", () => {
  it("includes both code and error", () => {
    expect(encodeError("internal", "boom")).toBe(
      'event: error\ndata: {"code":"internal","error":"boom"}\n\n'
    );
  });
});

describe("encodeFrame (discriminated union)", () => {
  it("dispatches on event type", () => {
    expect(encodeFrame({ event: "token", data: { text: "x" } })).toBe(
      encodeToken("x")
    );
    expect(encodeFrame({ event: "done", data: { sessionId: "s" } })).toBe(
      encodeDone("s")
    );
    expect(
      encodeFrame({ event: "error", data: { code: "c", error: "e" } })
    ).toBe(encodeError("c", "e"));
  });
});

describe("SSE_HEADERS / SSE_CONTENT_TYPE", () => {
  it("sets the correct Content-Type and disables caching / proxy buffering", () => {
    expect(SSE_CONTENT_TYPE).toBe("text/event-stream; charset=utf-8");
    expect(SSE_HEADERS["Content-Type"]).toBe(SSE_CONTENT_TYPE);
    expect(SSE_HEADERS["Cache-Control"]).toContain("no-cache");
    expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
  });
});

describe("toSseResponseBody", () => {
  async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  }

  it("concatenates yielded frames as UTF-8 bytes", async () => {
    async function* frames() {
      yield encodeToken("hi");
      yield encodeToken(" there");
      yield encodeDone("s-1");
    }
    const body = toSseResponseBody(frames());
    const text = await readAll(body);
    expect(text).toBe(
      encodeToken("hi") + encodeToken(" there") + encodeDone("s-1")
    );
  });

  it("converts a mid-stream generator error into a final error frame", async () => {
    async function* frames() {
      yield encodeToken("partial");
      throw new Error("boom mid-stream");
    }
    const body = toSseResponseBody(frames());
    const text = await readAll(body);
    expect(text).toContain(encodeToken("partial"));
    expect(text).toContain('event: error');
    expect(text).toContain('"code":"internal"');
    expect(text).toContain('"error":"boom mid-stream"');
    // No `done` frame after error.
    expect(text).not.toContain("event: done");
  });
});
