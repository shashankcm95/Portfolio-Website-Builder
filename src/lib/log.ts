/**
 * Phase R5b — Lightweight structured logger.
 *
 * Two output modes:
 *  - **Production** (`NODE_ENV === "production"`): one JSON object per
 *    line, trivially parseable by log aggregators. Shape:
 *    `{ ts, level, msg, reqId?, ...meta }`.
 *  - **Development**: single human-readable line with ANSI colors so
 *    tailing `next dev` is readable.
 *
 * The logger auto-tags entries with the current request id when one
 * is active via `runWithRequestId` (see `./log-context`). This is
 * best-effort: on Edge runtime the ALS lookup silently returns
 * undefined and the `reqId` field is omitted.
 *
 * This is intentionally small. It's not pino. If we ever need
 * sampling / redaction / transports, swap the impl behind this
 * interface — call sites won't change.
 */

import { currentRequestId } from "./log-context";

type Level = "debug" | "info" | "warn" | "error";

const IS_PROD = process.env.NODE_ENV === "production";

const COLOR: Record<Level, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m",  // cyan
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function emit(
  level: Level,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const ts = new Date().toISOString();
  const reqId = currentRequestId();

  if (IS_PROD) {
    const payload: Record<string, unknown> = { ts, level, msg };
    if (reqId) payload.reqId = reqId;
    if (meta) Object.assign(payload, meta);
    const line = JSON.stringify(payload);
    if (level === "error" || level === "warn") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
    return;
  }

  // Dev: colored, one-line
  const tag = `${COLOR[level]}${level.toUpperCase()}${RESET}`;
  const rid = reqId ? ` \x1b[90m[${reqId.slice(0, 8)}]${RESET}` : "";
  const metaStr =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  const line = `${ts} ${tag}${rid} ${msg}${metaStr}`;
  if (level === "error" || level === "warn") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
