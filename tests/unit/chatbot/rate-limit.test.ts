/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/chatbot/rate-limit.ts`. Uses the clock-
 * injection test hook to drive window rollover deterministically
 * (no real waiting).
 */

import {
  __resetForTests,
  __setClockForTests,
  check,
  visitorKey,
} from "@/lib/chatbot/rate-limit";
import {
  PER_PORTFOLIO_MESSAGES,
  PER_PORTFOLIO_WINDOW_MS,
  PER_VISITOR_MESSAGES,
  PER_VISITOR_WINDOW_MS,
} from "@/lib/chatbot/types";

let t = 1_700_000_000_000;
function advance(ms: number) {
  t += ms;
}

beforeEach(() => {
  t = 1_700_000_000_000;
  __setClockForTests(() => t);
  __resetForTests();
});

afterAll(() => {
  __setClockForTests(null);
});

describe("check — visitor scope", () => {
  it("allows up to PER_VISITOR_MESSAGES in a window", () => {
    const key = visitorKey("pf-1", "v-1");
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) {
      const d = check("visitor", key);
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(PER_VISITOR_MESSAGES - i - 1);
    }
  });

  it("denies the (N+1)th call with retryAfterMs ≈ windowMs", () => {
    const key = visitorKey("pf-1", "v-1");
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) check("visitor", key);
    const d = check("visitor", key);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.retryAfterMs).toBeGreaterThan(0);
    expect(d.retryAfterMs).toBeLessThanOrEqual(PER_VISITOR_WINDOW_MS);
  });

  it("recovers after the window rolls over", () => {
    const key = visitorKey("pf-1", "v-1");
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) check("visitor", key);
    expect(check("visitor", key).allowed).toBe(false);

    advance(PER_VISITOR_WINDOW_MS + 1);
    expect(check("visitor", key).allowed).toBe(true);
  });

  it("isolates keys — different visitor on same portfolio has independent budget", () => {
    const k1 = visitorKey("pf-1", "v-1");
    const k2 = visitorKey("pf-1", "v-2");
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) check("visitor", k1);
    expect(check("visitor", k1).allowed).toBe(false);
    expect(check("visitor", k2).allowed).toBe(true);
  });

  it("retryAfterMs reflects the oldest-in-window ageing out", () => {
    const key = visitorKey("pf-1", "v-1");
    check("visitor", key); // timestamp @ t
    advance(5 * 60 * 1000); // 5 min in
    for (let i = 1; i < PER_VISITOR_MESSAGES; i++) check("visitor", key);
    // All N used. Oldest was @ t=0, so it ages out at windowMs.
    const d = check("visitor", key);
    expect(d.allowed).toBe(false);
    // We're 5 min in; oldest expires at 10 min → retryAfter ≈ 5 min.
    expect(d.retryAfterMs).toBeGreaterThan(4 * 60 * 1000);
    expect(d.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000 + 1);
  });
});

describe("check — portfolio scope", () => {
  it("allows up to PER_PORTFOLIO_MESSAGES in a window", () => {
    // Use a small probe to avoid looping 300 times noisily.
    for (let i = 0; i < 10; i++) {
      expect(check("portfolio", "pf-1").allowed).toBe(true);
    }
  });

  it("isolates across portfolios", () => {
    for (let i = 0; i < 10; i++) check("portfolio", "pf-1");
    expect(check("portfolio", "pf-2").allowed).toBe(true);
  });

  it("uses PER_PORTFOLIO_WINDOW_MS for recovery", () => {
    // Exhaust the portfolio budget, then verify visitor budget stays
    // independent (visitor scope uses its own Map).
    for (let i = 0; i < PER_PORTFOLIO_MESSAGES; i++)
      check("portfolio", "pf-1");
    expect(check("portfolio", "pf-1").allowed).toBe(false);

    advance(PER_PORTFOLIO_WINDOW_MS / 2);
    expect(check("portfolio", "pf-1").allowed).toBe(false);

    advance(PER_PORTFOLIO_WINDOW_MS / 2 + 1);
    expect(check("portfolio", "pf-1").allowed).toBe(true);
  });
});

describe("cross-scope isolation", () => {
  it("visitor exhaustion does not block portfolio scope and vice versa", () => {
    const key = visitorKey("pf-1", "v-1");
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) check("visitor", key);
    // Portfolio scope is untouched
    expect(check("portfolio", "pf-1").allowed).toBe(true);
    // Visitor scope is exhausted
    expect(check("visitor", key).allowed).toBe(false);
  });
});
