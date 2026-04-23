/**
 * @jest-environment node
 *
 * Integration tests for the layout-review endpoint.
 *
 * Coverage:
 *   - 401 unauth
 *   - 404 unknown portfolio
 *   - 403 wrong owner
 *   - 201 happy path triggers a Tier 1 review and returns the summary
 *   - dedupe: a second POST while one is "running" returns the existing
 *     row instead of starting a new one
 *   - GET returns the latest review row (or null when none exist)
 *
 * The runner is fully mocked so we don't drive real generator + cheerio
 * end to end here. (Cheerio + scoring already covered in unit tests.)
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const mockSelectQueues: unknown[][] = [];
const mockInsertReturn: unknown[][] = [];
const mockUpdateCalls: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      where: () => self,
      orderBy: () => self,
      limit: async () => mockSelectQueues.shift() ?? [],
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(onFulfilled(mockSelectQueues.shift() ?? [])),
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => ({
        values: () => ({
          returning: async () =>
            mockInsertReturn.shift() ?? [{ id: "MISSING-INSERT-RETURN" }],
        }),
      })),
      update: jest.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            mockUpdateCalls.push(patch);
          },
        }),
      })),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
    desc: jest.fn(() => "desc"),
  };
});

// Mock the runner so we don't drive real Drizzle inserts inside it.
const mockRun = jest.fn();
jest.mock("@/lib/review/runner", () => ({
  runLayoutReview: (...a: unknown[]) => mockRun(...a),
}));

import {
  GET,
  POST,
} from "@/app/api/portfolios/[portfolioId]/layout-review/route";

function makeReq(body?: unknown): Request {
  const init: RequestInit = body
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }
    : { method: "GET" };
  return new Request(
    "http://localhost/api/portfolios/pf-1/layout-review",
    init
  );
}

function primeOwnerCheck(callerUid: string, portfolioOwnerUid: string | null) {
  if (portfolioOwnerUid === null) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([
      {
        id: "pf-1",
        userId: portfolioOwnerUid,
        templateId: "minimal",
      },
    ]);
  }
  return callerUid;
}

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectQueues.length = 0;
  mockInsertReturn.length = 0;
  mockUpdateCalls.length = 0;
  mockRun.mockReset();
});

// ─── POST ───────────────────────────────────────────────────────────────────

describe("POST /api/portfolios/:pid/layout-review", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await POST(makeReq({}) as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("404 when the portfolio doesn't exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", null);
    const res = (await POST(makeReq({}) as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(404);
  });

  it("403 when the portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u2-someone-else");
    const res = (await POST(makeReq({}) as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(403);
  });

  it("201 starts a new review and returns the runner's summary", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    // Dedupe lookup — no existing running row.
    mockSelectQueues.push([]);
    // Insert returns a fresh review id.
    mockInsertReturn.push([{ id: "lr-new" }]);

    mockRun.mockResolvedValue({
      id: "lr-new",
      portfolioId: "pf-1",
      templateId: "minimal",
      status: "completed",
      score: 97,
      issues: [
        {
          rule: "R1-img-missing-alt",
          tier: "static",
          severity: "warning",
          message: "img missing alt",
        },
      ],
      tier2Available: false,
      tier3Available: false,
      aiSummary: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
    });

    const res = (await POST(makeReq({}) as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.review.id).toBe("lr-new");
    expect(body.review.status).toBe("completed");
    expect(body.review.score).toBe(97);
    expect(body.review.issues).toHaveLength(1);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][1]).toMatchObject({
      portfolioId: "pf-1",
      enableAiTier: false,
    });
  });

  it("dedupes: a second POST while one is running returns the existing row", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    // Dedupe lookup — finds an existing running row.
    mockSelectQueues.push([
      {
        id: "lr-running",
        portfolioId: "pf-1",
        templateId: "minimal",
        status: "running",
        score: null,
        tier2Available: false,
        tier3Available: false,
        aiSummary: null,
        error: null,
        startedAt: new Date(),
        completedAt: null,
      },
    ]);
    // loadSummary triggers a second select for the row + a select for issues
    mockSelectQueues.push([
      {
        id: "lr-running",
        portfolioId: "pf-1",
        templateId: "minimal",
        status: "running",
        score: null,
        tier2Available: false,
        tier3Available: false,
        aiSummary: null,
        error: null,
        startedAt: new Date(),
        completedAt: null,
      },
    ]);
    mockSelectQueues.push([]); // no issues yet

    const res = (await POST(makeReq({}) as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(200); // 200 (existing), not 201 (newly created)
    const body = await res.json();
    expect(body.review.id).toBe("lr-running");
    expect(body.review.status).toBe("running");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("forwards enableAiTier=true to the runner", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([]); // no existing running
    mockInsertReturn.push([{ id: "lr-new" }]);
    mockRun.mockResolvedValue({
      id: "lr-new",
      portfolioId: "pf-1",
      templateId: "minimal",
      status: "completed",
      score: 100,
      issues: [],
      tier2Available: false,
      tier3Available: true,
      aiSummary: "Looks great.",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
    });

    await POST(makeReq({ enableAiTier: true }) as any, {
      params: { portfolioId: "pf-1" },
    });
    expect(mockRun.mock.calls[0][1].enableAiTier).toBe(true);
  });

  it("400 on malformed JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = (await POST(req as any, { params: { portfolioId: "pf-1" } }))!;
    expect(res.status).toBe(400);
  });
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/portfolios/:pid/layout-review", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await GET(makeReq() as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("returns null when no reviews exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([]); // latest-row lookup empty
    const res = (await GET(makeReq() as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review).toBeNull();
  });

  it("returns the latest review with its issues", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([{ id: "lr-1" }]); // latest row
    // loadSummary: full row + issues
    mockSelectQueues.push([
      {
        id: "lr-1",
        portfolioId: "pf-1",
        templateId: "minimal",
        status: "completed",
        score: 88,
        tier2Available: false,
        tier3Available: false,
        aiSummary: null,
        error: null,
        startedAt: new Date("2026-04-20"),
        completedAt: new Date("2026-04-20"),
      },
    ]);
    mockSelectQueues.push([
      {
        id: "issue-1",
        rule: "R10-hero-name-wraps",
        tier: "rendered",
        severity: "critical",
        message: "Hero name wraps at 375px",
        page: "index",
        viewport: 375,
        elementSelector: "h1.hero-name",
        details: { lineCount: 2 },
      },
    ]);

    const res = (await GET(makeReq() as any, {
      params: { portfolioId: "pf-1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.id).toBe("lr-1");
    expect(body.review.score).toBe(88);
    expect(body.review.issues).toHaveLength(1);
    expect(body.review.issues[0].rule).toBe("R10-hero-name-wraps");
  });
});
