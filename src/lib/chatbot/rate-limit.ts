/**
 * Phase 5 — Two-tier in-memory sliding-window rate limiter.
 *
 * Scopes:
 *   - "visitor": keyed by `${portfolioId}:${visitorId}` — caps per-visitor
 *     chat volume (default 20 / 10 min). Stops a single noisy visitor from
 *     draining the owner's BYOK.
 *   - "portfolio": keyed by `portfolioId` — caps total chatbot spend per
 *     portfolio (default 300 / 24 h). Protects against distributed abuse.
 *
 * Implementation: one Map<key, timestamps[]> per scope. Each check drops
 * expired timestamps, then pushes the new one (if allowed). The window
 * pruning makes memory self-managing without a reaper goroutine.
 *
 * NOTE: in-memory state is per-process. Multi-instance deploys need Redis
 * — this is Phase 6+ territory. Acceptable on single-region self-host and
 * on Vercel where cold starts reset counters (traffic is low enough that
 * each counter replay from scratch is fine).
 *
 * Clock is injectable via `__setClockForTests` so window rollover tests
 * can run synchronously without waiting real time.
 */

import {
  PER_PORTFOLIO_MESSAGES,
  PER_PORTFOLIO_WINDOW_MS,
  PER_VISITOR_MESSAGES,
  PER_VISITOR_WINDOW_MS,
} from "./types";

export type RateLimitScope = "visitor" | "portfolio" | "owner" | "ip";

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the oldest-in-window timestamp ages out. 0 when allowed. */
  retryAfterMs: number;
  /** Remaining capacity inside the current window. */
  remaining: number;
}

interface WindowConfig {
  windowMs: number;
  max: number;
}

const CONFIG: Record<RateLimitScope, WindowConfig> = {
  visitor: { windowMs: PER_VISITOR_WINDOW_MS, max: PER_VISITOR_MESSAGES },
  portfolio: {
    windowMs: PER_PORTFOLIO_WINDOW_MS,
    max: PER_PORTFOLIO_MESSAGES,
  },
  // Phase 5.2 — owner-facing Ask Assistant. The owner is iterating on
  // their own site; a light cap (60 / 10min) bounds runaway loops and
  // accidental BYOK drain without being aggressive.
  owner: { windowMs: 10 * 60 * 1000, max: 60 },
  // Phase 6 — analytics ingest; caps a single hostile IP at 60/min so
  // it can't inflate a portfolio's pageview counter.
  ip: { windowMs: 60 * 1000, max: 60 },
};

/** Separate Maps per scope so one scope's growth never dominates the other. */
const STATE: Record<RateLimitScope, Map<string, number[]>> = {
  visitor: new Map(),
  portfolio: new Map(),
  owner: new Map(),
  ip: new Map(),
};

let now: () => number = () => Date.now();

/**
 * Check whether `key` may perform another action right now. When
 * allowed, the call **records** the new timestamp — do not check twice
 * back-to-back for the same action, or you'll double-count.
 */
export function check(
  scope: RateLimitScope,
  key: string
): RateLimitDecision {
  const { windowMs, max } = CONFIG[scope];
  const nowMs = now();
  const cutoff = nowMs - windowMs;

  const bucket = STATE[scope].get(key);
  // Drop expired entries in place. O(n) per call where n = window count.
  const active = bucket ? bucket.filter((t) => t > cutoff) : [];

  if (active.length >= max) {
    // Earliest in-window entry decides when we recover room.
    const oldest = active[0];
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + windowMs - nowMs),
      remaining: 0,
    };
  }

  active.push(nowMs);
  STATE[scope].set(key, active);
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: max - active.length,
  };
}

/** Key helper — joins a (portfolioId, visitorId) pair consistently. */
export function visitorKey(portfolioId: string, visitorId: string): string {
  return `${portfolioId}:${visitorId}`;
}

// ─── Test hooks ─────────────────────────────────────────────────────────────

/**
 * Replace the clock (for deterministic window rollover tests). Call
 * `__setClockForTests(null)` to restore `Date.now`.
 */
export function __setClockForTests(clock: (() => number) | null): void {
  now = clock ?? (() => Date.now());
}

/** Drop all state (for per-test isolation). */
export function __resetForTests(): void {
  STATE.visitor.clear();
  STATE.portfolio.clear();
  STATE.owner.clear();
  STATE.ip.clear();
}

/** Expose current capacity for tests that want to assert pruning. */
export function __sizeForTests(scope: RateLimitScope): number {
  return STATE[scope].size;
}
