/**
 * @jest-environment node
 *
 * Phase R6.1 — pagination guardrails on GET /api/portfolios.
 *
 * Covers:
 *   - default limit when no query params
 *   - honored custom `?limit=` and `?offset=`
 *   - 400 on limit > 1000
 *   - 400 on non-numeric limit
 *   - 400 on non-numeric offset
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

interface LimitOffsetCapture {
  limit?: number;
  offset?: number;
}

const selectCaptures: LimitOffsetCapture[] = [];
const mockSelectReturn: unknown[][] = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const capture: LimitOffsetCapture = {};
    selectCaptures.push(capture);
    const self: any = {
      from: () => self,
      where: () => self,
      orderBy: () => self,
      limit: (n: number) => {
        capture.limit = n;
        return self;
      },
      offset: (n: number) => {
        capture.offset = n;
        return self;
      },
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(onFulfilled(mockSelectReturn.shift() ?? [])),
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
  };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { GET as listPortfolios } from "@/app/api/portfolios/route";
import { NextRequest } from "next/server";

function makeReq(url: string) {
  return new NextRequest(new Request(url, { method: "GET" }));
}

beforeEach(() => {
  mockAuth.mockReset();
  selectCaptures.length = 0;
  mockSelectReturn.length = 0;
});

describe("GET /api/portfolios — pagination guardrails", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await listPortfolios(makeReq("http://localhost/api/portfolios"));
    expect(res.status).toBe(401);
  });

  it("applies the default limit of 100 and offset 0 when no query params", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectReturn.push([]);
    const res = await listPortfolios(makeReq("http://localhost/api/portfolios"));
    expect(res.status).toBe(200);
    expect(selectCaptures).toHaveLength(1);
    expect(selectCaptures[0].limit).toBe(100);
    expect(selectCaptures[0].offset).toBe(0);
  });

  it("honors a custom ?limit= value", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectReturn.push([]);
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=25")
    );
    expect(res.status).toBe(200);
    expect(selectCaptures[0].limit).toBe(25);
    expect(selectCaptures[0].offset).toBe(0);
  });

  it("honors a custom ?offset= value", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectReturn.push([]);
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=50&offset=100")
    );
    expect(res.status).toBe(200);
    expect(selectCaptures[0].limit).toBe(50);
    expect(selectCaptures[0].offset).toBe(100);
  });

  it("accepts limit exactly at the 1000 cap", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectReturn.push([]);
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=1000")
    );
    expect(res.status).toBe(200);
    expect(selectCaptures[0].limit).toBe(1000);
  });

  it("400 when limit exceeds 1000", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=1001")
    );
    expect(res.status).toBe(400);
    // No DB call issued
    expect(selectCaptures).toHaveLength(0);
  });

  it("400 on non-numeric limit", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=abc")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("limit must be a positive integer");
  });

  it("400 on zero or negative limit", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?limit=0")
    );
    expect(res.status).toBe(400);
  });

  it("400 on non-numeric offset", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await listPortfolios(
      makeReq("http://localhost/api/portfolios?offset=xyz")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("offset must be a positive integer");
  });

  it("preserves the response shape { portfolios: [...] }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectReturn.push([
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ]);
    const res = await listPortfolios(makeReq("http://localhost/api/portfolios"));
    const body = await res.json();
    expect(Array.isArray(body.portfolios)).toBe(true);
    expect(body.portfolios).toHaveLength(2);
  });
});
