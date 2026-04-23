/**
 * @jest-environment node
 *
 * Phase R3 — Integration tests for the Phase C testimonials CRUD.
 *
 * Coverage:
 *   - GET   list: auth-gated, returns rows ordered by displayOrder
 *   - POST  create: validation, auth, displayOrder auto-append, 201
 *   - PATCH edit: partial body, visibility toggle, 404 on unknown id
 *   - DELETE: 204 happy path, 404 when row not found, ownership check
 *
 * FIFO mock pattern follows share-links.test.ts — each test primes the
 * select queue, insert-return queue, update-return queue, and delete-
 * return queue as needed.
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const mockSelectQueues: unknown[][] = [];
const mockInsertReturnQueues: unknown[][] = [];
const mockUpdateReturnQueues: unknown[][] = [];
const mockDeleteReturnQueues: unknown[][] = [];

const mockInsertValuesCalls: unknown[] = [];
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
  function insertChain() {
    return {
      values: (v: unknown) => {
        mockInsertValuesCalls.push(v);
        return {
          returning: async () => mockInsertReturnQueues.shift() ?? [{}],
        };
      },
    };
  }
  function updateChain() {
    return {
      set: (patch: Record<string, unknown>) => {
        mockUpdateSetCalls.push(patch);
        return {
          where: () => ({
            returning: async () =>
              mockUpdateReturnQueues.shift() ?? [],
          }),
        };
      },
    };
  }
  function deleteChain() {
    return {
      where: () => ({
        returning: async () => mockDeleteReturnQueues.shift() ?? [],
      }),
    };
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => insertChain()),
      update: jest.fn(() => updateChain()),
      delete: jest.fn(() => deleteChain()),
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
    max: jest.fn(() => "max"),
  };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import {
  GET as listTestimonials,
  POST as createTestimonial,
} from "@/app/api/portfolios/[portfolioId]/testimonials/route";
import {
  PATCH as patchTestimonial,
  DELETE as deleteTestimonial,
} from "@/app/api/portfolios/[portfolioId]/testimonials/[testimonialId]/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(
  body?: unknown,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "POST"
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/portfolios/pf1/testimonials", init);
}

function primeOwnerCheck(portfolioUserId: string | null) {
  if (portfolioUserId === null) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([{ id: "pf1", userId: portfolioUserId }]);
  }
}

const validBody = {
  quote: "Working with her changed how we ship.",
  authorName: "Alex Example",
  authorTitle: "VP Engineering",
  authorCompany: "Acme",
};

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectQueues.length = 0;
  mockInsertReturnQueues.length = 0;
  mockUpdateReturnQueues.length = 0;
  mockDeleteReturnQueues.length = 0;
  mockInsertValuesCalls.length = 0;
  mockUpdateSetCalls.length = 0;
});

// ─── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/portfolios/:pid/testimonials", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await listTestimonials(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("403 on foreign portfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u2");
    const res = (await listTestimonials(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(403);
  });

  it("200 returns rows including hidden ones so the editor can toggle them", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockSelectQueues.push([
      {
        id: "t1",
        quote: "visible quote",
        authorName: "A",
        isVisible: true,
        displayOrder: 0,
      },
      {
        id: "t2",
        quote: "hidden quote",
        authorName: "B",
        isVisible: false,
        displayOrder: 1,
      },
    ]);

    const res = (await listTestimonials(makeReq(undefined, "GET") as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.testimonials).toHaveLength(2);
    expect(body.testimonials[1].isVisible).toBe(false);
  });
});

// ─── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/portfolios/:pid/testimonials", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await createTestimonial(makeReq(validBody) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(401);
  });

  it("400 on missing quote", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await createTestimonial(
      makeReq({ authorName: "A" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues?.some((i: any) => i.path === "quote")).toBe(true);
  });

  it("400 on missing authorName", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await createTestimonial(
      makeReq({ quote: "A good long quote from someone." }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("400 on author URL that isn't https", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    const res = (await createTestimonial(
      makeReq({ ...validBody, authorUrl: "not-a-url" }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(400);
  });

  it("201 auto-appends displayOrder when absent", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    // max() result: current tail is 5, so the next row gets 6
    mockSelectQueues.push([{ max: 5 }]);
    mockInsertReturnQueues.push([
      { id: "t-new", ...validBody, displayOrder: 6, isVisible: true },
    ]);

    const res = (await createTestimonial(makeReq(validBody) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.testimonial.id).toBe("t-new");

    const values = mockInsertValuesCalls[0] as Record<string, unknown>;
    expect(values.displayOrder).toBe(6);
    expect(values.isVisible).toBe(true);
    expect(values.portfolioId).toBe("pf1");
  });

  it("201 uses displayOrder=0 when no rows exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockSelectQueues.push([{ max: null }]);
    mockInsertReturnQueues.push([
      { id: "t-first", ...validBody, displayOrder: 0, isVisible: true },
    ]);

    const res = (await createTestimonial(makeReq(validBody) as any, {
      params: { portfolioId: "pf1" },
    }))!;
    expect(res.status).toBe(201);
    const values = mockInsertValuesCalls[0] as Record<string, unknown>;
    expect(values.displayOrder).toBe(0);
  });

  it("201 respects explicit displayOrder", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    // Explicit displayOrder skips the max() query
    mockInsertReturnQueues.push([
      { id: "t3", ...validBody, displayOrder: 42, isVisible: true },
    ]);

    const res = (await createTestimonial(
      makeReq({ ...validBody, displayOrder: 42 }) as any,
      { params: { portfolioId: "pf1" } }
    ))!;
    expect(res.status).toBe(201);
    const values = mockInsertValuesCalls[0] as Record<string, unknown>;
    expect(values.displayOrder).toBe(42);
  });
});

// ─── PATCH /:testimonialId ───────────────────────────────────────────────────

describe("PATCH /api/portfolios/:pid/testimonials/:tid", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await patchTestimonial(
      makeReq({ isVisible: false }, "PATCH") as any,
      { params: { portfolioId: "pf1", testimonialId: "t1" } }
    ))!;
    expect(res.status).toBe(401);
  });

  it("404 when the row isn't under this portfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    // empty returning() array = no row matched the compound where clause
    mockUpdateReturnQueues.push([]);

    const res = (await patchTestimonial(
      makeReq({ isVisible: false }, "PATCH") as any,
      { params: { portfolioId: "pf1", testimonialId: "unknown" } }
    ))!;
    expect(res.status).toBe(404);
  });

  it("200 toggles visibility with a minimal patch", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockUpdateReturnQueues.push([
      {
        id: "t1",
        quote: "old quote",
        authorName: "A",
        isVisible: false,
        displayOrder: 0,
      },
    ]);

    const res = (await patchTestimonial(
      makeReq({ isVisible: false }, "PATCH") as any,
      { params: { portfolioId: "pf1", testimonialId: "t1" } }
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.testimonial.isVisible).toBe(false);
    expect(mockUpdateSetCalls[0].isVisible).toBe(false);
    expect(mockUpdateSetCalls[0]).not.toHaveProperty("quote");
  });

  it("200 persists a full multi-field edit", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockUpdateReturnQueues.push([
      {
        id: "t1",
        quote: "rewritten quote",
        authorName: "A",
        authorTitle: "CEO",
        authorCompany: "NewCo",
        isVisible: true,
        displayOrder: 0,
      },
    ]);

    const res = (await patchTestimonial(
      makeReq(
        {
          quote: "rewritten quote",
          authorTitle: "CEO",
          authorCompany: "NewCo",
        },
        "PATCH"
      ) as any,
      { params: { portfolioId: "pf1", testimonialId: "t1" } }
    ))!;
    expect(res.status).toBe(200);
    const patch = mockUpdateSetCalls[0];
    expect(patch.quote).toBe("rewritten quote");
    expect(patch.authorTitle).toBe("CEO");
    expect(patch.authorCompany).toBe("NewCo");
  });
});

// ─── DELETE /:testimonialId ──────────────────────────────────────────────────

describe("DELETE /api/portfolios/:pid/testimonials/:tid", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await deleteTestimonial(
      makeReq(undefined, "DELETE") as any,
      { params: { portfolioId: "pf1", testimonialId: "t1" } }
    ))!;
    expect(res.status).toBe(401);
  });

  it("404 when the row isn't under this portfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockDeleteReturnQueues.push([]); // no rows affected

    const res = (await deleteTestimonial(
      makeReq(undefined, "DELETE") as any,
      { params: { portfolioId: "pf1", testimonialId: "unknown" } }
    ))!;
    expect(res.status).toBe(404);
  });

  it("204 on happy path", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    primeOwnerCheck("u1");
    mockDeleteReturnQueues.push([{ id: "t1" }]);

    const res = (await deleteTestimonial(
      makeReq(undefined, "DELETE") as any,
      { params: { portfolioId: "pf1", testimonialId: "t1" } }
    ))!;
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
