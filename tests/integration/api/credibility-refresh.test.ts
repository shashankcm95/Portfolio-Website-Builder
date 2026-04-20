/**
 * @jest-environment node
 *
 * Integration tests for POST /api/portfolios/:pid/projects/:prid/credibility/refresh.
 * Drizzle + the GitHub layer are mocked.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type Step =
  | { kind: "authSelect"; value: unknown[] }
  | { kind: "update" };

const mockSteps: Step[] = [];
const mockSetCapture = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => {
          const step = mockSteps.shift();
          if (step?.kind !== "authSelect")
            throw new Error(`Expected authSelect, got ${step?.kind}`);
          return step.value;
        },
      };
      return chain;
    },
    update: () => ({
      set: (patch: unknown) => {
        mockSetCapture(patch);
        return {
          where: () => {
            const self: any = {
              then: (onFulfilled: (v: unknown) => unknown) => {
                const step = mockSteps.shift();
                if (step?.kind !== "update")
                  throw new Error(`Expected update, got ${step?.kind}`);
                return Promise.resolve(onFulfilled(undefined));
              },
            };
            return self;
          },
        };
      },
    }),
  };
  return { db };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
  };
});

// GitHub layer
jest.mock("@/lib/github/url-parser", () => ({
  parseGitHubUrl: () => ({ owner: "acme", repo: "demo" }),
}));

const mockGetAuthClient = jest.fn();
jest.mock("@/lib/github/authenticated-client", () => ({
  getAuthenticatedGitHubClient: (...a: unknown[]) =>
    mockGetAuthClient(...a),
}));

const mockFetchRepoData = jest.fn();
jest.mock("@/lib/github/repo-fetcher", () => ({
  RepoFetcher: class {
    fetchRepoData = mockFetchRepoData;
  },
}));

const mockCredFetchAll = jest.fn();
jest.mock("@/lib/github/credibility-fetcher", () => ({
  CredibilityFetcher: class {
    fetchAll = mockCredFetchAll;
  },
}));

import { POST } from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/credibility/refresh/route";

const repoDataFixture = {
  metadata: {
    name: "demo",
    fullName: "acme/demo",
    description: null,
    language: null,
    stargazersCount: 0,
    forksCount: 0,
    topics: [],
    defaultBranch: "main",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    license: null,
    htmlUrl: "https://github.com/acme/demo",
  },
  readme: "",
  fileTree: [],
  dependencies: [],
};

function makeReq() {
  return new Request(
    "http://localhost/api/portfolios/pf1/projects/p1/credibility/refresh",
    { method: "POST" }
  );
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockSetCapture.mockReset();
  mockGetAuthClient.mockReset();
  mockFetchRepoData.mockReset();
  mockCredFetchAll.mockReset();

  mockGetAuthClient.mockResolvedValue({});
  mockFetchRepoData.mockResolvedValue(repoDataFixture);
});

describe("POST /credibility/refresh", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when project does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [] });
    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when project belongs to a different user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          project: {
            id: "p1",
            sourceType: "github",
            repoUrl: "https://github.com/acme/demo",
          },
          portfolioUserId: "u2",
        },
      ],
    });
    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 for manual projects", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          project: {
            id: "p1",
            sourceType: "manual",
            repoUrl: null,
          },
          portfolioUserId: "u1",
        },
      ],
    });
    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 429 when refreshed less than 5 minutes ago", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          project: {
            id: "p1",
            sourceType: "github",
            repoUrl: "https://github.com/acme/demo",
            credibilityFetchedAt: new Date(Date.now() - 60_000), // 1 min ago
          },
          portfolioUserId: "u1",
        },
      ],
    });
    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("updates the project and returns fresh signals on success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const signals = {
      schemaVersion: 1,
      ci: { status: "ok", conclusion: "success", runUrl: "x", runAt: "y" },
    };
    mockCredFetchAll.mockResolvedValue(signals);

    mockSteps.push(
      {
        kind: "authSelect",
        value: [
          {
            project: {
              id: "p1",
              sourceType: "github",
              repoUrl: "https://github.com/acme/demo",
              credibilityFetchedAt: null,
            },
            portfolioUserId: "u1",
          },
        ],
      },
      { kind: "update" }
    );

    const res = await POST(makeReq() as any, {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credibilitySignals).toEqual(signals);
    expect(typeof body.credibilityFetchedAt).toBe("string");
    // The .set() call captures the actual in-memory object (not serialized)
    expect(mockSetCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        credibilitySignals: signals,
      })
    );
  });
});
