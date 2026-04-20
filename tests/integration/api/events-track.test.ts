/**
 * @jest-environment node
 *
 * Integration tests for POST /api/events/track.
 *
 * Key assertions:
 *   - Happy pageview inserts a row with the right shape
 *   - Bot UAs are silently dropped (204 without an insert)
 *   - Self-referrer (owner previewing) is silently dropped
 *   - Rate limit exhausts to silent 204 (never 429)
 *   - 400 on bad body
 *   - Unknown portfolio → 204 (don't confirm existence)
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSelectQueues: unknown[][] = [];
const mockInserts: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      where: () => self,
      limit: async () => mockSelectQueues.shift() ?? [],
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => ({
        values: async (val: Record<string, unknown>) => {
          mockInserts.push(val);
        },
      })),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq") };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { POST } from "@/app/api/events/track/route";
import { __resetForTests } from "@/lib/chatbot/rate-limit";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/events/track", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

beforeEach(() => {
  mockSelectQueues.length = 0;
  mockInserts.length = 0;
  __resetForTests();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/events/track — validation", () => {
  it("400 on malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/events/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      }) as any
    );
    expect(res.status).toBe(400);
  });

  it("400 on missing portfolioId", async () => {
    const res = await POST(makeReq({ path: "/" }) as any);
    expect(res.status).toBe(400);
  });

  it("400 on unknown eventType", async () => {
    const res = await POST(
      makeReq(
        { portfolioId: "pf-1", eventType: "clicked-everywhere" },
        { "user-agent": DESKTOP_UA }
      ) as any
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/events/track — happy path", () => {
  it("inserts a pageview row for a desktop UA", async () => {
    mockSelectQueues.push([{ id: "pf-1" }]);
    const res = await POST(
      makeReq(
        {
          portfolioId: "pf-1",
          path: "/about",
          referrer: "https://twitter.com/x/123?y=z",
        },
        { "user-agent": DESKTOP_UA }
      ) as any
    );
    expect(res.status).toBe(204);
    expect(mockInserts).toHaveLength(1);
    expect(mockInserts[0]).toMatchObject({
      portfolioId: "pf-1",
      eventType: "pageview",
      path: "/about",
      referrer: "https://twitter.com", // origin-only
      userAgentBucket: "desktop",
    });
  });

  it("captures country from CF-IPCountry header", async () => {
    mockSelectQueues.push([{ id: "pf-1" }]);
    await POST(
      makeReq(
        { portfolioId: "pf-1", path: "/" },
        { "user-agent": DESKTOP_UA, "cf-ipcountry": "US" }
      ) as any
    );
    expect(mockInserts[0].country).toBe("US");
  });
});

describe("POST /api/events/track — silent drops", () => {
  it("drops bot UAs without inserting", async () => {
    const res = await POST(
      makeReq(
        { portfolioId: "pf-1", path: "/" },
        { "user-agent": "Googlebot/2.1" }
      ) as any
    );
    expect(res.status).toBe(204);
    expect(mockInserts).toHaveLength(0);
  });

  it("drops self-referrer traffic (owner preview)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    mockSelectQueues.push([{ id: "pf-1" }]);
    const res = await POST(
      makeReq(
        {
          portfolioId: "pf-1",
          path: "/",
          referrer: "https://app.example/portfolios/pf-1?tab=preview",
        },
        { "user-agent": DESKTOP_UA }
      ) as any
    );
    expect(res.status).toBe(204);
    expect(mockInserts).toHaveLength(0);
  });

  it("drops unknown portfolio silently (no ID leak)", async () => {
    mockSelectQueues.push([]);
    const res = await POST(
      makeReq(
        { portfolioId: "pf-does-not-exist", path: "/" },
        { "user-agent": DESKTOP_UA }
      ) as any
    );
    expect(res.status).toBe(204);
    expect(mockInserts).toHaveLength(0);
  });
});

describe("POST /api/events/track — rate limit", () => {
  it("after 60 hits in the same minute, further hits 204 silently without inserting", async () => {
    // Prime portfolio lookup for the 60 accepted hits.
    for (let i = 0; i < 60; i++) mockSelectQueues.push([{ id: "pf-1" }]);
    for (let i = 0; i < 60; i++) {
      const res = await POST(
        makeReq(
          { portfolioId: "pf-1", path: "/" },
          { "user-agent": DESKTOP_UA, "x-forwarded-for": "10.0.0.1" }
        ) as any
      );
      expect(res.status).toBe(204);
    }
    // 61st hit — rate limiter drops before portfolio lookup.
    const res = await POST(
      makeReq(
        { portfolioId: "pf-1", path: "/" },
        { "user-agent": DESKTOP_UA, "x-forwarded-for": "10.0.0.1" }
      ) as any
    );
    expect(res.status).toBe(204);
    expect(mockInserts).toHaveLength(60);
  });
});
