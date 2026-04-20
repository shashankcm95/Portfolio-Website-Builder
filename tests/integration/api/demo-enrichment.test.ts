/**
 * @jest-environment node
 *
 * Phase 4.2 — oEmbed enrichment hook in PUT /api/.../demo. Mocks
 * global.fetch (so we can script YouTube/Loom/Vimeo replies) and the
 * Drizzle `db` (so we can observe updates). Asserts:
 *   (a) fresh save → fetchOembed called → row enriched and returned
 *   (b) unchanged URL + fresh cache → copy-forward, fetch NOT called
 *   (c) provider 500 → row unenriched, PUT still returns 200
 *   (d) enrichment exceeds 3s → PUT returns in-window with unenriched rows
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

// Queues for the various select shapes.
const mockOwnershipRows: unknown[][] = [];
const mockListRows: unknown[][] = [];
const mockUrlRows: unknown[][] = [];
const mockInsertReturns: unknown[][] = [];
const mockUpdateCalls: Array<{ id: string; set: Record<string, unknown> }> = [];
let mockCurrentUpdateId: string | null = null;

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      orderBy: async () => {
        const rows = mockListRows.shift();
        if (!rows) throw new Error("No list rows queued for select.orderBy()");
        return rows;
      },
      limit: async () => {
        const rows = mockOwnershipRows.shift();
        if (!rows) throw new Error("No ownership rows queued");
        return rows;
      },
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
          const pre = mockInsertReturns.shift();
          if (pre) return pre;
          return (Array.isArray(vals) ? vals : [vals]).map(
            (v: any, i: number) => ({
              id: `row-${i}`,
              createdAt: new Date(),
              thumbnailUrl: null,
              oembedTitle: null,
              oembedFetchedAt: null,
              ...v,
            })
          );
        },
      }),
    };
  }

  function deleteBuilder() {
    return { where: async () => {} };
  }

  function updateBuilder() {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if (mockCurrentUpdateId) {
            mockUpdateCalls.push({ id: mockCurrentUpdateId, set: patch });
            mockCurrentUpdateId = null;
          } else {
            mockUpdateCalls.push({ id: "?", set: patch });
          }
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

import {
  PUT,
} from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/demo/route";

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

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

beforeEach(() => {
  mockAuth.mockReset();
  mockOwnershipRows.length = 0;
  mockListRows.length = 0;
  mockUrlRows.length = 0;
  mockInsertReturns.length = 0;
  mockUpdateCalls.length = 0;
  mockFetch = jest.fn();
  global.fetch = mockFetch as any;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("PUT /demo — oEmbed enrichment", () => {
  it("(a) fresh YouTube save → fetchOembed called → row enriched", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    // Old-rows query (empty — first save)
    mockUrlRows.push([]);

    // Insert returns one row with id=yt-1
    mockInsertReturns.push([
      {
        id: "yt-1",
        projectId: "pr1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);

    // oEmbed provider returns a valid thumb
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
          title: "Hello",
        }),
        { status: 200 }
      )
    );

    // Re-read rows after enrichment — returns the enriched version
    mockListRows.push([
      {
        id: "yt-1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        oembedTitle: "Hello",
        oembedFetchedAt: new Date(),
      },
    ]);

    const res = await PUT(
      makePut({ demos: [{ url: "https://www.youtube.com/watch?v=abc" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demos[0].thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/abc/hqdefault.jpg"
    );
    expect(body.demos[0].oembedTitle).toBe("Hello");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].set.thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/abc/hqdefault.jpg"
    );
  });

  it("(b) unchanged URL + fresh cache → copy-forward, fetch NOT called", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    // Old-rows query returns the same URL with fresh cache (1 day old)
    const freshDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockUrlRows.push([
      {
        url: "https://www.youtube.com/watch?v=abc",
        thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        oembedTitle: "Cached",
        oembedFetchedAt: freshDate,
      },
    ]);
    mockInsertReturns.push([
      {
        id: "yt-1",
        projectId: "pr1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);

    // Re-read after copy-forward should return the cached thumb
    mockListRows.push([
      {
        id: "yt-1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        oembedTitle: "Cached",
        oembedFetchedAt: freshDate,
      },
    ]);

    const res = await PUT(
      makePut({ demos: [{ url: "https://www.youtube.com/watch?v=abc" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].set.thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/abc/hqdefault.jpg"
    );
    const body = await res.json();
    expect(body.demos[0].thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/abc/hqdefault.jpg"
    );
  });

  it("(b2) stale cache (>30d) → refetch, not copy-forward", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    mockUrlRows.push([
      {
        url: "https://www.youtube.com/watch?v=abc",
        thumbnailUrl: "https://old-thumb.example/old.jpg",
        oembedTitle: "Old",
        oembedFetchedAt: staleDate,
      },
    ]);
    mockInsertReturns.push([
      {
        id: "yt-1",
        projectId: "pr1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          thumbnail_url: "https://i.ytimg.com/vi/abc/new.jpg",
          title: "New",
        }),
        { status: 200 }
      )
    );
    mockListRows.push([
      {
        id: "yt-1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: "https://i.ytimg.com/vi/abc/new.jpg",
        oembedTitle: "New",
        oembedFetchedAt: new Date(),
      },
    ]);

    const res = await PUT(
      makePut({ demos: [{ url: "https://www.youtube.com/watch?v=abc" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("(c) provider 500 → row unenriched, PUT still returns 200", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    mockUrlRows.push([]);
    mockInsertReturns.push([
      {
        id: "loom-1",
        projectId: "pr1",
        url: "https://loom.com/share/xyz",
        type: "loom",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);
    mockFetch.mockResolvedValue(new Response("boom", { status: 500 }));

    const res = await PUT(
      makePut({ demos: [{ url: "https://loom.com/share/xyz" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No update happened → no re-read → still 200 with the unenriched row
    expect(mockUpdateCalls).toHaveLength(0);
    const body = await res.json();
    expect(body.demos[0].thumbnailUrl).toBeNull();
  });

  it("(d) enrichment exceeds 3s → PUT returns within timebox with unenriched rows", async () => {
    jest.useFakeTimers();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    mockUrlRows.push([]);
    mockInsertReturns.push([
      {
        id: "yt-1",
        projectId: "pr1",
        url: "https://www.youtube.com/watch?v=abc",
        type: "youtube",
        title: null,
        order: 0,
        thumbnailUrl: null,
        oembedTitle: null,
        oembedFetchedAt: null,
      },
    ]);
    // Fetch never resolves within the window — simulate a slow provider.
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    thumbnail_url: "https://late.example/t.jpg",
                    title: "Late",
                  }),
                  { status: 200 }
                )
              ),
            10_000 // 10s — well beyond the 3s timebox
          );
        })
    );

    const p = PUT(
      makePut({ demos: [{ url: "https://www.youtube.com/watch?v=abc" }] }) as any,
      { params: { portfolioId: "pf1", projectId: "pr1" } } as any
    );

    // Advance past the 3s enrichment deadline.
    await jest.advanceTimersByTimeAsync(3100);
    const res = await p;
    expect(res.status).toBe(200);
    // No update has been persisted (fetch still pending) → unenriched body
    expect(mockUpdateCalls).toHaveLength(0);
    const body = await res.json();
    expect(body.demos[0].thumbnailUrl).toBeNull();

    jest.useRealTimers();
  });
});
