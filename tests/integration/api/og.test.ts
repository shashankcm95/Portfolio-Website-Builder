/**
 * @jest-environment node
 *
 * Integration tests for GET /api/og.
 *
 * `@vercel/og` needs a real Satori runtime + system fonts to produce
 * actual PNG bytes — expensive and flaky in a unit-test setting. We
 * mock `@vercel/og`'s `ImageResponse` so we're really testing the
 * route's data loading + shape + caching headers, not the PNG encode.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockImageResponse = jest.fn();
jest.mock("@vercel/og", () => ({
  ImageResponse: jest.fn(function (
    element: unknown,
    opts: { headers?: Record<string, string> } = {}
  ) {
    mockImageResponse(element, opts);
    // Simulate a 200 PNG response with the caller's headers.
    return new Response("<fake-png>", {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        ...(opts.headers ?? {}),
      },
    });
  }),
}));

const mockSelectQueues: unknown[][] = [];
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
    db: { select: jest.fn(() => selectChain()) },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq") };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { GET } from "@/app/api/og/route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeReq(qs: string = "") {
  return new Request(`http://localhost/api/og${qs ? "?" + qs : ""}`);
}

beforeEach(() => {
  mockSelectQueues.length = 0;
  mockImageResponse.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/og — validation", () => {
  it("400 when portfolioId is missing", async () => {
    const res = await GET(makeReq() as any);
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/portfolioId/i);
  });

  it("404 when portfolio not found", async () => {
    mockSelectQueues.push([]);
    const res = await GET(makeReq("portfolioId=pf-miss") as any);
    expect(res.status).toBe(404);
  });

  it("404 when projectId belongs to a different portfolio", async () => {
    mockSelectQueues.push([
      { id: "pf-1", name: "Ada", profileData: { basics: { name: "Ada" } } },
    ]);
    mockSelectQueues.push([{ id: "pr-1", portfolioId: "pf-other" }]);
    const res = await GET(
      makeReq("portfolioId=pf-1&projectId=pr-1") as any
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/og — portfolio happy path", () => {
  it("returns an image with cache headers", async () => {
    mockSelectQueues.push([
      {
        id: "pf-1",
        name: "Ada's Portfolio",
        profileData: {
          basics: {
            name: "Ada Lovelace",
            label: "Analyst",
            summary: "A short summary.",
            avatar: "https://cdn.example/ada.png",
          },
          skills: [{ name: "Algebra" }, { name: "Logic" }],
        },
      },
    ]);
    const res = await GET(makeReq("portfolioId=pf-1") as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect(res.headers.get("cache-control")).toContain("stale-while-revalidate");

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it("ignores `v` cache-buster query param", async () => {
    mockSelectQueues.push([
      {
        id: "pf-1",
        name: "A",
        profileData: { basics: { name: "A", summary: "x" } },
      },
    ]);
    const res = await GET(makeReq("portfolioId=pf-1&v=abc123") as any);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/og — project happy path", () => {
  it("routes to the project layout when projectId matches", async () => {
    mockSelectQueues.push([
      {
        id: "pf-1",
        name: "Ada's Portfolio",
        profileData: { basics: { name: "Ada" } },
      },
    ]);
    mockSelectQueues.push([
      {
        id: "pr-1",
        portfolioId: "pf-1",
        displayName: "Widget API",
        repoName: "widget",
        manualDescription: "REST + GraphQL",
        repoMetadata: null,
        techStack: ["Go", "Postgres"],
      },
    ]);
    const res = await GET(
      makeReq("portfolioId=pf-1&projectId=pr-1") as any
    );
    expect(res.status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });
});
