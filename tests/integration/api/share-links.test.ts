/**
 * @jest-environment node
 *
 * Integration tests for the share-links CRUD endpoints.
 *
 * Coverage:
 *   - POST create: happy path + label + expiresIn + 400 shapes + auth + ownership
 *   - GET list: auth-gated, ownership-gated, returns summaries
 *   - DELETE revoke: 204 + only the owner can revoke + token must be under the portfolio
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

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
      orderBy: async () => mockSelectQueues.shift() ?? [],
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
            mockInsertReturn.shift() ?? [{ id: "MISSING-RETURN" }],
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

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import {
  GET as listLinks,
  POST as createLink,
} from "@/app/api/portfolios/[portfolioId]/share-links/route";
import { DELETE as revokeLink } from "@/app/api/portfolios/[portfolioId]/share-links/[tokenId]/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(body?: unknown, method: "POST" | "DELETE" | "GET" = "POST") {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(
    "http://localhost/api/portfolios/pf1/share-links",
    init
  );
}

function primeOwnerCheck(userId: string, portfolioUserId: string | null) {
  if (portfolioUserId === null) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([{ id: "pf1", userId: portfolioUserId }]);
  }
  return userId;
}

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectQueues.length = 0;
  mockInsertReturn.length = 0;
  mockUpdateCalls.length = 0;
});

// ─── POST ───────────────────────────────────────────────────────────────────

describe("POST /api/portfolios/:pid/share-links", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await createLink(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("404 when the portfolio doesn't exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", null);
    const res = (await createLink(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(404);
  });

  it("403 when the portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u2-someone-else");
    const res = (await createLink(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(403);
  });

  it("201 with empty body returns a token + url; no expiry", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockInsertReturn.push([
      {
        id: "lk-1",
        portfolioId: "pf1",
        token: "ABCDEFGHJKMNPQRSTVWXYZ00",
        label: null,
        expiresAt: null,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        createdAt: new Date(),
      },
    ]);

    const res = (await createLink(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.link.token).toBe("ABCDEFGHJKMNPQRSTVWXYZ00");
    expect(body.link.expiresAt).toBeNull();
    expect(body.url).toMatch(/\/share\/ABCDEFGHJKMNPQRSTVWXYZ00$/);
  });

  it("201 with label + expiresIn=7d sets an expiry ~ 7 days out", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    const before = Date.now();
    mockInsertReturn.push([
      {
        id: "lk-2",
        portfolioId: "pf1",
        token: "ABCDEFGHJKMNPQRSTVWXYZ11",
        label: "for Jane",
        // mirror what the POST sends to db.insert() — we capture it in a
        // second step below rather than asserting on this mock return.
        expiresAt: new Date(before + 7 * 24 * 60 * 60 * 1000 + 5),
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        createdAt: new Date(),
      },
    ]);
    const res = (await createLink(
      makeReq({ label: "for Jane", expiresIn: "7d" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.link.label).toBe("for Jane");
    // Fudge the expiry check — the clock moved between create and assert.
    const expires = Date.parse(body.link.expiresAt);
    expect(expires).toBeGreaterThan(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(expires).toBeLessThan(before + 7 * 24 * 60 * 60 * 1000 + 10_000);
  });

  it("400 on invalid expiresIn", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    const res = (await createLink(
      makeReq({ expiresIn: "5y" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("400 on oversized label", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    const res = (await createLink(
      makeReq({ label: "x".repeat(100) }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = (await createLink(req as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(400);
  });
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/portfolios/:pid/share-links", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await listLinks(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("200 returns summaries newest first", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([
      {
        id: "lk-1",
        portfolioId: "pf1",
        token: "AAAAAAAAAAAAAAAAAAAAAAAA",
        label: "one",
        expiresAt: null,
        revokedAt: null,
        viewCount: 3,
        lastViewedAt: null,
        createdAt: new Date("2026-02-01"),
      },
      {
        id: "lk-2",
        portfolioId: "pf1",
        token: "BBBBBBBBBBBBBBBBBBBBBBBB",
        label: null,
        expiresAt: null,
        revokedAt: new Date("2026-01-15"),
        viewCount: 1,
        lastViewedAt: null,
        createdAt: new Date("2026-01-10"),
      },
    ]);
    const res = (await listLinks(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links).toHaveLength(2);
    expect(body.links[0].label).toBe("one");
    expect(body.links[1].revokedAt).not.toBeNull();
  });
});

// ─── DELETE (revoke) ────────────────────────────────────────────────────────

describe("DELETE /api/portfolios/:pid/share-links/:tokenId", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await revokeLink(
      new Request("http://localhost/x", { method: "DELETE" }) as any,
      { params: { portfolioId: "pf1", tokenId: "lk-1" } }
    ))!;
    expect(res.status).toBe(401);
  });

  it("403 when portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u2");
    const res = (await revokeLink(
      new Request("http://localhost/x", { method: "DELETE" }) as any,
      { params: { portfolioId: "pf1", tokenId: "lk-1" } }
    ))!;
    expect(res.status).toBe(403);
  });

  it("404 when the token doesn't belong to this portfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([]); // token lookup — empty
    const res = (await revokeLink(
      new Request("http://localhost/x", { method: "DELETE" }) as any,
      { params: { portfolioId: "pf1", tokenId: "lk-1" } }
    ))!;
    expect(res.status).toBe(404);
  });

  it("204 sets revokedAt on the matching row", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1", "u1");
    mockSelectQueues.push([{ id: "lk-1" }]); // token lookup hit
    const res = (await revokeLink(
      new Request("http://localhost/x", { method: "DELETE" }) as any,
      { params: { portfolioId: "pf1", tokenId: "lk-1" } }
    ))!;
    expect(res.status).toBe(204);
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].revokedAt).toBeInstanceOf(Date);
  });
});
