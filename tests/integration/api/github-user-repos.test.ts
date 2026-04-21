/**
 * @jest-environment node
 *
 * Integration tests for GET /api/github/users/:login/repos.
 * Covers auth, scoped alreadyImported flagging, empty list, and rate-limit mapping.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type Step =
  | { kind: "portfolio"; value: unknown[] }
  | { kind: "projects"; value: Array<{ repoOwner: string | null; repoName: string | null }> };

const mockSteps: Step[] = [];

jest.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const chain: any = {
        from: () => chain,
        where: () => {
          const whereObj: any = {
            limit: async () => {
              const step = mockSteps.shift();
              if (step?.kind !== "portfolio")
                throw new Error(
                  `Expected portfolio, got ${step?.kind ?? "undefined"}`
                );
              return step.value;
            },
            then: (onFulfilled: (v: unknown) => unknown) => {
              const step = mockSteps.shift();
              if (step?.kind !== "projects")
                throw new Error(
                  `Expected projects, got ${step?.kind ?? "undefined"}`
                );
              return Promise.resolve(onFulfilled(step.value));
            },
          };
          return whereObj;
        },
      };
      return chain;
    },
  };
  return { db };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
    inArray: jest.fn(() => "inArray"),
  };
});

const mockGetAuthClient = jest.fn();
jest.mock("@/lib/github/authenticated-client", () => ({
  getAuthenticatedGitHubClient: (...a: unknown[]) => mockGetAuthClient(...a),
}));

const mockListUserRepos = jest.fn();
jest.mock("@/lib/github/repo-fetcher", () => ({
  listUserRepos: (...a: unknown[]) => mockListUserRepos(...a),
}));

import { GET } from "@/app/api/github/users/[login]/repos/route";

function makeReq(login: string, portfolioId?: string) {
  const url = new URL(
    `http://localhost/api/github/users/${login}/repos${
      portfolioId ? `?portfolioId=${portfolioId}` : ""
    }`
  );
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockGetAuthClient.mockReset();
  mockListUserRepos.mockReset();
  mockGetAuthClient.mockResolvedValue({});
});

const fixtureRepo = (name: string) => ({
  owner: "octocat",
  name,
  fullName: `octocat/${name}`,
  description: null,
  language: null,
  stars: 0,
  forks: 0,
  updatedAt: "2026-04-01T00:00:00Z",
  htmlUrl: `https://github.com/octocat/${name}`,
  isFork: false,
  isArchived: false,
});

describe("GET /api/github/users/:login/repos", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeReq("octocat") as any, {
      params: { login: "octocat" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty list when the user has no repos", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockListUserRepos.mockResolvedValue([]);
    const res = await GET(makeReq("octocat") as any, {
      params: { login: "octocat" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos).toEqual([]);
  });

  it("returns alreadyImported=false for every row when portfolioId is omitted", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockListUserRepos.mockResolvedValue([
      fixtureRepo("alpha"),
      fixtureRepo("beta"),
    ]);
    const res = await GET(makeReq("octocat") as any, {
      params: { login: "octocat" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos.map((r: any) => r.alreadyImported)).toEqual([
      false,
      false,
    ]);
  });

  it("flags repos already present in the scoped portfolio as alreadyImported", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "portfolio", value: [{ id: "pf1" }] },
      {
        kind: "projects",
        value: [{ repoOwner: "octocat", repoName: "alpha" }],
      }
    );
    mockListUserRepos.mockResolvedValue([
      fixtureRepo("alpha"),
      fixtureRepo("beta"),
    ]);

    const res = await GET(makeReq("octocat", "pf1") as any, {
      params: { login: "octocat" },
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = body.repos as Array<{ name: string; alreadyImported: boolean }>;
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.alreadyImported]));
    expect(byName).toEqual({ alpha: true, beta: false });
  });

  it("returns 429 when GitHub rejects with a rate-limit 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockListUserRepos.mockRejectedValue(
      new Error(
        "GitHub API error 403 (rate limit exceeded) for https://api.github.com/users/octocat/repos"
      )
    );
    const res = await GET(makeReq("octocat") as any, {
      params: { login: "octocat" },
    } as any);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("github_rate_limited");
  });

  it("returns 404 when GitHub responds 404 for an unknown user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockListUserRepos.mockRejectedValue(
      new Error(
        "GitHub API error 404 (Not Found) for https://api.github.com/users/ghost/repos"
      )
    );
    const res = await GET(makeReq("ghost") as any, {
      params: { login: "ghost" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("falls through to the no-scope path when the portfolioId isn't owned by the caller", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    // Portfolio ownership returns empty → we should skip the IN-query entirely.
    mockSteps.push({ kind: "portfolio", value: [] });
    mockListUserRepos.mockResolvedValue([fixtureRepo("alpha")]);

    const res = await GET(makeReq("octocat", "pf-other") as any, {
      params: { login: "octocat" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repos[0].alreadyImported).toBe(false);
  });
});
