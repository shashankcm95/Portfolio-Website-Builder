/**
 * @jest-environment node
 *
 * GET/PUT/DELETE /api/portfolios/:pid/projects/:prid/demo — auth, ownership,
 * validation, idempotent list-replace semantics. Drizzle fully mocked so we
 * can cover both happy and 4xx paths without a real Postgres.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

// Queued rows returned from the ownership `.select(...).limit(1)` call AND
// the list-load `.select(...).orderBy(...)` call. The route uses two
// different chain shapes, but the test feeds both via one queue that the
// mock pops in call order.
const mockOwnershipRows: unknown[][] = [];
const mockListRows: unknown[][] = [];
const mockInsertCalls: Array<Record<string, unknown>[]> = [];
const mockDeleteCalls: number[] = []; // record count of delete calls
const mockTransactionReturns: unknown[][] = []; // what the transaction cb resolves to
let mockTransactionThrow: Error | null = null;

// Phase 4.1: the PUT / DELETE routes do an extra `db.select({url}).from(...)
// .where(...)` awaited directly (no .limit()/.orderBy()). Queue URL rows
// in `mockUrlRows`; default to empty list when none queued so tests that
// don't care about cleanup don't have to stub it.
const mockUrlRows: unknown[][] = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      orderBy: async () => {
        const rows = mockListRows.shift();
        if (!rows)
          throw new Error("No list rows queued for select.orderBy()");
        return rows;
      },
      limit: async () => {
        const rows = mockOwnershipRows.shift();
        if (!rows) throw new Error("No ownership rows queued");
        return rows;
      },
      // Awaited directly (no .limit/.orderBy) — the url-list select path.
      then: (onFulfilled: (v: unknown) => unknown) => {
        const rows = mockUrlRows.shift() ?? [];
        return Promise.resolve(onFulfilled(rows));
      },
    };
    return self;
  }

  function insertBuilder() {
    return {
      values: (vals: unknown) => ({
        returning: async () => {
          mockInsertCalls.push(
            Array.isArray(vals) ? vals : [vals as Record<string, unknown>]
          );
          // Fabricate returned rows that mirror inputs + synthetic id.
          return (Array.isArray(vals) ? vals : [vals]).map(
            (v: any, i: number) => ({
              id: `new-${i}`,
              createdAt: new Date(),
              ...v,
            })
          );
        },
      }),
    };
  }

  function deleteBuilder() {
    return {
      where: async () => {
        mockDeleteCalls.push(mockDeleteCalls.length);
      },
    };
  }

  // Phase 4.2 — db.update() is fired by the async oEmbed enrichment hook.
  // We make it a no-op so the enrichment path is exercised without
  // affecting the test assertions (the re-read only fires when
  // enrichment succeeds, which it won't since fetch is mocked below).
  function updateBuilder() {
    return {
      set: () => ({
        where: async () => {
          /* noop */
        },
      }),
    };
  }

  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => insertBuilder()),
      delete: jest.fn(() => deleteBuilder()),
      update: jest.fn(() => updateBuilder()),
      async transaction(cb: (tx: unknown) => Promise<unknown>) {
        if (mockTransactionThrow) {
          const err = mockTransactionThrow;
          mockTransactionThrow = null;
          throw err;
        }
        return cb({
          delete: jest.fn(() => deleteBuilder()),
          insert: jest.fn(() => insertBuilder()),
        });
      },
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
    asc: jest.fn(() => "asc"),
  };
});

// Phase 4.2 — the enrichment hook calls fetchOembed() which goes out to
// youtube.com / loom.com / vimeo.com. Stub global.fetch so tests stay
// hermetic; returning 404 makes every enrichment a no-op (pays the
// nothing-to-re-read path, keeping existing tests valid).
const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async () =>
    new Response("not found", { status: 404 })
  ) as any;
});
afterAll(() => {
  global.fetch = originalFetch;
});

import {
  DELETE,
  GET,
  PUT,
} from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/demo/route";

function makePut(body: unknown) {
  return new Request(
    "http://localhost/api/portfolios/pf1/projects/pr1/demo",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeReq() {
  return new Request(
    "http://localhost/api/portfolios/pf1/projects/pr1/demo"
  );
}

beforeEach(() => {
  mockAuth.mockReset();
  mockOwnershipRows.length = 0;
  mockListRows.length = 0;
  mockInsertCalls.length = 0;
  mockDeleteCalls.length = 0;
  mockTransactionReturns.length = 0;
  mockTransactionThrow = null;
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /demo", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when project does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([]);
    const res = await GET(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "nope" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when project belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u2" },
    ]);
    const res = await GET(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("returns the empty list when no demos exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    mockListRows.push([]);

    const res = await GET(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ demos: [] });
  });

  it("returns the list of demos in order", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    mockListRows.push([
      {
        id: "1",
        url: "https://cdn.example.com/a.png",
        type: "image",
        title: null,
        order: 0,
      },
      {
        id: "2",
        url: "https://cdn.example.com/b.png",
        type: "image",
        title: "Second slide",
        order: 1,
      },
    ]);

    const res = await GET(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    const body = await res.json();
    expect(body.demos).toHaveLength(2);
    expect(body.demos[0].type).toBe("image");
    expect(body.demos[1].title).toBe("Second slide");
  });
});

// ─── PUT ────────────────────────────────────────────────────────────────────

describe("PUT /demo", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PUT(makePut({ demos: [] }) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const req = new Request(
      "http://localhost/api/portfolios/pf1/projects/pr1/demo",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json{",
      }
    );
    const res = await PUT(req as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("rejects a javascript: URL", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const res = await PUT(
      makePut({ demos: [{ url: "javascript:alert(1)" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it("rejects more than 8 demos", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const demos = Array.from({ length: 9 }, (_, i) => ({
      url: `https://cdn.example.com/${i}.png`,
    }));
    const res = await PUT(makePut({ demos }) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("rejects a malformed URL within a larger list", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const res = await PUT(
      makePut({
        demos: [
          { url: "https://cdn.example.com/ok.png" },
          { url: "not-a-url" },
        ],
      }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(400);
  });

  it("persists a list of 3 demos and returns them in order", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);

    const res = await PUT(
      makePut({
        demos: [
          { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          { url: "https://cdn.example.com/shot1.png", title: "Home page" },
          { url: "https://cdn.example.com/shot2.gif" },
        ],
      }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demos).toHaveLength(3);
    expect(body.demos[0].type).toBe("youtube");
    expect(body.demos[1].type).toBe("image");
    expect(body.demos[1].title).toBe("Home page");
    expect(body.demos[2].type).toBe("gif");
    // Order cached on the row
    expect(body.demos.map((d: { order: number }) => d.order)).toEqual([0, 1, 2]);

    // One transaction inserts 3 rows
    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0]).toHaveLength(3);
  });

  it("persists an empty list (clear-via-PUT) without inserting", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);

    const res = await PUT(makePut({ demos: [] }) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demos).toEqual([]);
    expect(mockInsertCalls).toHaveLength(0);
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /demo", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("clears all demos and returns 204", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const res = await DELETE(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(204);
    expect(mockDeleteCalls.length).toBeGreaterThan(0);
  });
});
