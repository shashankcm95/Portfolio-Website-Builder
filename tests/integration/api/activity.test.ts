/**
 * @jest-environment node
 *
 * Integration tests for GET /api/activity.
 * Drizzle is mocked — we assert the route composes the feed correctly
 * and enforces auth/limit semantics, not that SQL executes.
 */

// ─── Mocks (must be declared before importing the route) ────────────────────
const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

/**
 * Tiny chain-mock: every query method returns `this` until .limit() resolves
 * with a promise. Callers push results into `results` in the order the route
 * awaits them (portfolios → projects → deployments for this route).
 */
const results: unknown[] = [];
function makeChain() {
  const chain: Record<string, jest.Mock> = {};
  const methods = ["select", "from", "where", "orderBy", "innerJoin"];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain.limit = jest.fn(async () => results.shift() ?? []);
  return chain;
}

const dbChain = makeChain();
jest.mock("@/lib/db", () => ({
  db: {
    select: (...a: unknown[]) => dbChain.select(...a),
  },
}));

// Route imports must come AFTER mock setup
import { GET } from "@/app/api/activity/route";

function makeReq(url = "http://localhost/api/activity?limit=10") {
  return new Request(url);
}

beforeEach(() => {
  results.length = 0;
  mockAuth.mockReset();
  Object.values(dbChain).forEach((m) => m.mockClear?.());
  // Re-apply the .limit resolver since mockClear wipes the implementation
  dbChain.limit.mockImplementation(async () => results.shift() ?? []);
});

describe("GET /api/activity", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns an empty event list for a user with no activity", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // portfolios, projects, deployments — all empty
    results.push([], [], []);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ events: [] });
  });

  it("merges and sorts heterogeneous rows descending by occurredAt", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    const now = Date.now();
    results.push(
      // portfolios
      [
        {
          id: "pf1",
          name: "Alpha",
          createdAt: new Date(now - 60_000),
        },
      ],
      // projects
      [
        {
          id: "pr1",
          portfolioId: "pf1",
          displayName: "webapp",
          repoName: "webapp",
          createdAt: new Date(now - 120_000),
          lastAnalyzed: new Date(now - 10_000),
          pipelineStatus: "complete",
        },
      ],
      // deployments
      [
        {
          id: "d1",
          portfolioId: "pf1",
          status: "success",
          url: "https://alpha.pages.dev",
          createdAt: new Date(now - 30_000),
          deployedAt: new Date(now - 30_000),
        },
      ]
    );

    const res = await GET(makeReq());
    const body = await res.json();

    // Expected order (most recent first): project_analyzed (-10s), deployment (-30s),
    // portfolio_created (-60s), project_added (-120s)
    expect(body.events.map((e: any) => e.type)).toEqual([
      "project_analyzed",
      "deployment_live",
      "portfolio_created",
      "project_added",
    ]);
  });

  it("caps limit at 50 and defaults to 10", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    results.push([], [], []);
    await GET(makeReq("http://localhost/api/activity?limit=9999"));
    // Each of the 3 .limit() calls should have been made with 50
    const limitArgs = dbChain.limit.mock.calls.map((c) => c[0]);
    expect(limitArgs).toEqual([50, 50, 50]);
  });

  it("falls back to limit=10 when the query param is missing or junk", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    results.push([], [], []);
    await GET(makeReq("http://localhost/api/activity"));
    const limitArgs = dbChain.limit.mock.calls.map((c) => c[0]);
    expect(limitArgs).toEqual([10, 10, 10]);

    dbChain.limit.mockClear();
    results.push([], [], []);
    await GET(makeReq("http://localhost/api/activity?limit=abc"));
    const junkArgs = dbChain.limit.mock.calls.map((c) => c[0]);
    expect(junkArgs).toEqual([10, 10, 10]);
  });
});
