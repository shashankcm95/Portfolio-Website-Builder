/**
 * Phase 5.1 — Small fetch-based SSE client.
 *
 * The visitor widget and the owner Ask-Assistant dialog both stream chat
 * replies via `POST` + `text/event-stream`. EventSource is useless here
 * (GET-only, no body), so we roll a tiny parser over `fetch().body`.
 *
 * Usage:
 *
 *     const result = await streamChat(url, body, {
 *       onToken: (t) => append(t),
 *     });
 *     // result is { sessionId } on success,
 *     // or throws StreamError on server-emitted error/ transport failure.
 *
 * Parser contract:
 *   - Frames are separated by blank lines (\n\n).
 *   - Each frame has an `event:` line + one or more `data:` lines.
 *   - `data:` payload is JSON.
 *   - Unknown `event:` values are silently skipped.
 *   - A `done` frame resolves the promise; an `error` frame rejects it.
 *   - Stream end without `done` or `error` → treated as successful but
 *     with an empty sessionId (client can still show whatever tokens
 *     already arrived).
 */

export interface StreamChatCallbacks {
  onToken: (text: string) => void;
}

export interface StreamChatResult {
  sessionId: string;
}

export class StreamError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "StreamError";
  }
}

/** Non-JSON / non-2xx response body. Thrown before the stream opens. */
export class StreamHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "StreamHttpError";
  }
}

/**
 * POST `body` (JSON) to `url` and stream the SSE response, invoking
 * `callbacks.onToken(text)` per token frame. Resolves with `{sessionId}`
 * on a clean `done`. Rejects with:
 *   - `StreamHttpError` if the response isn't 2xx (server answered with
 *     a normal JSON error — rate-limit, publish gate, etc.).
 *   - `StreamError` if the server emits an `error` frame mid-stream.
 *   - A vanilla `Error` on transport failure (network, aborted fetch).
 */
export async function streamChat(
  url: string,
  body: unknown,
  callbacks: StreamChatCallbacks,
  init: { signal?: AbortSignal } = {}
): Promise<StreamChatResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: init.signal,
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as unknown;
    throw new StreamHttpError(
      res.status,
      errBody,
      (errBody as { error?: string })?.error ??
        `Request failed with status ${res.status}`
    );
  }

  if (!res.body) {
    throw new Error("Response had no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionId = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Drain complete frames (separated by blank lines).
      while (true) {
        const sep = buffer.indexOf("\n\n");
        if (sep === -1) break;
        const rawFrame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const handled = handleFrame(rawFrame, callbacks);
        if (handled.kind === "done") {
          sessionId = handled.sessionId;
          // Drain reader but treat stream as complete.
          return { sessionId };
        }
        if (handled.kind === "error") {
          throw new StreamError(handled.code, handled.error);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  // Flush final buffered frame if any (server may omit trailing \n\n).
  if (buffer.trim().length > 0) {
    const handled = handleFrame(buffer, callbacks);
    if (handled.kind === "done") return { sessionId: handled.sessionId };
    if (handled.kind === "error") {
      throw new StreamError(handled.code, handled.error);
    }
  }

  return { sessionId };
}

// ─── Internal ───────────────────────────────────────────────────────────────

type HandledFrame =
  | { kind: "token" }
  | { kind: "done"; sessionId: string }
  | { kind: "error"; code: string; error: string }
  | { kind: "skip" };

/**
 * Parse a single frame (no trailing `\n\n`). Returns the handled outcome;
 * invokes `onToken` for token frames. Malformed frames are skipped.
 */
export function handleFrame(
  raw: string,
  callbacks: StreamChatCallbacks
): HandledFrame {
  let event: string | null = null;
  const dataParts: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).replace(/^ /, ""));
    }
    // Lines starting with ":" are comments per spec; ignored.
  }

  if (!event || dataParts.length === 0) return { kind: "skip" };

  let payload: unknown;
  try {
    payload = JSON.parse(dataParts.join("\n"));
  } catch {
    return { kind: "skip" };
  }

  switch (event) {
    case "token": {
      const text =
        payload && typeof (payload as { text?: unknown }).text === "string"
          ? (payload as { text: string }).text
          : "";
      if (text) callbacks.onToken(text);
      return { kind: "token" };
    }
    case "done": {
      const sessionId =
        payload && typeof (payload as { sessionId?: unknown }).sessionId === "string"
          ? (payload as { sessionId: string }).sessionId
          : "";
      return { kind: "done", sessionId };
    }
    case "error": {
      const p = (payload ?? {}) as { code?: string; error?: string };
      return {
        kind: "error",
        code: p.code ?? "unknown",
        error: p.error ?? "Unknown error",
      };
    }
    default:
      return { kind: "skip" };
  }
}
