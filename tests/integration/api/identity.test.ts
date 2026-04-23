/**
 * @jest-environment node
 *
 * Phase R3 — Integration tests for the Phase C identity endpoint.
 *
 * Covers the three risk surfaces the route owns:
 *   1. Auth + ownership: 401 / 404 / 403 exactly match the shared
 *      `authorizePortfolio` contract.
 *   2. Zod validation: every constraint in `identityPatchSchema` maps
 *      to a 400 with an `issues[]` payload. Happy PATCH shapes persist
 *      correctly.
 *   3. Merge semantics: omitted keys are untouched; `null` is an
 *      intentional clear; unknown keys rejected by `.strict()`.
 *
 * Mock approach mirrors share-links.test.ts — a FIFO queue of rows
 * primed by each test; `db.select().from(...).where(...)` returns the
 * next queued result. `update().set().where().returning()` returns the
 * next queued insert row.
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const mockSelectQueues: unknown[][] = [];
const mockUpdateReturnQueues: unknown[][] = [];
const mockUpdateSetCalls: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      where: () => self,
      limit: async () => mockSelectQueues.shift() ?? [],
      orderBy: async () => mockSelectQueues.shift() ?? [],
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(onFulfilled(mockSelectQueues.shift() ?? [])),
    };
    return self;
  }
  function updateChain() {
    const self: any = {
      set: (patch: Record<string, unknown>) => {
        mockUpdateSetCalls.push(patch);
        return {
          where: () => ({
            returning: async () =>
              mockUpdateReturnQueues.shift() ?? [{}],
          }),
        };
      },
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      update: jest.fn(() => updateChain()),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq"), and: jest.fn(() => "and") };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import {
  GET as getIdentity,
  PATCH as patchIdentity,
} from "@/app/api/portfolios/[portfolioId]/identity/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(body?: unknown, method: "GET" | "PATCH" = "PATCH") {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/portfolios/pf1/identity", init);
}

/**
 * Prime the auth helper's ownership lookup. Pass `null` for a 404 and a
 * different userId for a 403.
 */
function primeOwnerCheck(portfolioUserId: string | null) {
  if (portfolioUserId === null) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([{ id: "pf1", userId: portfolioUserId }]);
  }
}

/** Default "current" identity row the GET handler returns. */
const defaultIdentityRow = {
  positioning: "Existing positioning line",
  namedEmployers: ["Acme"],
  hireStatus: "open",
  hireCtaText: null,
  hireCtaHref: null,
  anchorStatOverride: null,
};

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectQueues.length = 0;
  mockUpdateReturnQueues.length = 0;
  mockUpdateSetCalls.length = 0;
});

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/portfolios/:pid/identity", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await getIdentity(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("404 when the portfolio doesn't exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck(null);
    const res = (await getIdentity(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(404);
  });

  it("403 when the portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u2-someone-else");
    const res = (await getIdentity(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(403);
  });

  it("200 returns the current identity fields", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockSelectQueues.push([defaultIdentityRow]);

    const res = (await getIdentity(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity).toEqual(defaultIdentityRow);
  });
});

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/portfolios/:pid/identity", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await patchIdentity(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("400 on malformed JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const badReq = new Request(
      "http://localhost/api/portfolios/pf1/identity",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }
    );
    const res = (await patchIdentity(badReq as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("400 on positioning that's too short", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await patchIdentity(makeReq({ positioning: "hi" }) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues?.[0]?.path).toBe("positioning");
  });

  it("400 on positioning longer than the cap", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const huge = "x".repeat(200);
    const res = (await patchIdentity(makeReq({ positioning: huge }) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(400);
  });

  it("400 on unknown top-level key (strict)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await patchIdentity(
      makeReq({ positioning: "A valid positioning one-liner", bogus: 1 }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("400 on hireCtaHref that is neither mailto/https/relative", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await patchIdentity(
      makeReq({ hireCtaHref: "javascript:alert(1)" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("400 on hireStatus outside the enum", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await patchIdentity(
      makeReq({ hireStatus: "sometimes" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("200 persists a valid positioning update", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockUpdateReturnQueues.push([
      {
        ...defaultIdentityRow,
        positioning: "I build accessible, pixel-perfect experiences",
      },
    ]);

    const res = (await patchIdentity(
      makeReq({
        positioning: "I build accessible, pixel-perfect experiences",
      }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity.positioning).toBe(
      "I build accessible, pixel-perfect experiences"
    );
    // The patch set should only mention the fields actually sent + updatedAt.
    const patch = mockUpdateSetCalls[0];
    expect(patch).toHaveProperty("positioning");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("namedEmployers");
  });

  it("200 clears positioning when `null` is sent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockUpdateReturnQueues.push([
      { ...defaultIdentityRow, positioning: null },
    ]);

    const res = (await patchIdentity(makeReq({ positioning: null }) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(200);
    expect(mockUpdateSetCalls[0].positioning).toBeNull();
  });

  it("200 rejects hireStatus='not-looking' at the edge but accepts via clearing CTAs", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockUpdateReturnQueues.push([
      {
        ...defaultIdentityRow,
        hireStatus: "not-looking",
        hireCtaText: null,
        hireCtaHref: null,
      },
    ]);

    const res = (await patchIdentity(
      makeReq({
        hireStatus: "not-looking",
        hireCtaText: null,
        hireCtaHref: null,
      }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(200);
    const patch = mockUpdateSetCalls[0];
    expect(patch.hireStatus).toBe("not-looking");
    expect(patch.hireCtaText).toBeNull();
    expect(patch.hireCtaHref).toBeNull();
  });

  it("200 with empty body is a no-op that still returns current state", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    // empty PATCH takes the "nothing to change" branch and re-queries state
    mockSelectQueues.push([defaultIdentityRow]);

    const res = (await patchIdentity(makeReq({}) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity).toEqual(defaultIdentityRow);
    // Should NOT have called update()
    expect(mockUpdateSetCalls.length).toBe(0);
  });

  it("accepts mailto:, https:, and relative CTA hrefs", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    for (const href of [
      "mailto:me@example.com",
      "https://calendly.com/x",
      "/contact",
    ]) {
      primeOwnerCheck("u1");
      mockUpdateReturnQueues.push([
        { ...defaultIdentityRow, hireCtaHref: href },
      ]);
      const res = (await patchIdentity(
        makeReq({ hireCtaHref: href }) as any,
        { params: { portfolioId: "pf1" } }
      ))!;
      expect(res.status).toBe(200);
    }
  });
});
