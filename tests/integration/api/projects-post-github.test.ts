/**
 * @jest-environment node
 *
 * Integration tests for POST /api/portfolios/:id/projects — GitHub branch.
 * Focus: Phase 1 credibility-signals wiring. Asserts that the inserted
 * project row carries `credibilitySignals` + `credibilityFetchedAt` when
 * the fetch succeeds, and `null` when it rejects.
 */

// ─── Auth mock ──────────────────────────────────────────────────────────────
const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

// ─── DB chain mock ──────────────────────────────────────────────────────────
type Step =
  | { kind: "ownership"; value: unknown[] }
  | { kind: "orders"; value: Array<{ displayOrder: number | null }> }
  | { kind: "insertProject"; value: unknown[] }
  | { kind: "insertSources" };

const mockSteps: Step[] = [];
const mockInsertCalls: Array<{ rows: unknown }> = [];

jest.mock("@/lib/db", () => {
  const db = {
    select: jest.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => {
          const whereObj: any = {
            limit: async () => {
              const step = mockSteps.shift();
              if (step?.kind !== "ownership")
                throw new Error(
                  `Expected ownership step, got ${step?.kind ?? "undefined"}`
                );
              return step.value;
            },
            then: (onFulfilled: (v: unknown) => unknown) => {
              const step = mockSteps.shift();
              if (step?.kind !== "orders")
                throw new Error(
                  `Expected orders step, got ${step?.kind ?? "undefined"}`
                );
              return Promise.resolve(onFulfilled(step.value));
            },
          };
          return whereObj;
        },
      };
      return chain;
    }),
    insert: () => ({
      values: (rows: unknown) => {
        mockInsertCalls.push({ rows });
        // `.values(rows)` is awaitable for insert-without-returning (sources)
        // AND chainable via `.returning()` for insert-with-returning (project).
        const self: any = {
          returning: async () => {
            const step = mockSteps.shift();
            if (step?.kind !== "insertProject")
              throw new Error(
                `Expected insertProject, got ${step?.kind ?? "undefined"}`
              );
            return step.value;
          },
          then: (onFulfilled: (v: unknown) => unknown) => {
            const step = mockSteps.shift();
            if (step?.kind !== "insertSources")
              throw new Error(
                `Expected insertSources, got ${step?.kind ?? "undefined"}`
              );
            return Promise.resolve(onFulfilled(undefined));
          },
        };
        return self;
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

// ─── GitHub layer mocks ─────────────────────────────────────────────────────
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

const mockCredibilityFetchAll = jest.fn();
jest.mock("@/lib/github/credibility-fetcher", () => ({
  CredibilityFetcher: class {
    fetchAll = mockCredibilityFetchAll;
  },
}));

jest.mock("@/lib/github/stack-detector", () => ({
  extractVerifiedStack: () => ["Next.js", "Drizzle ORM"],
}));

jest.mock("@/lib/github/url-parser", () => ({
  parseGitHubUrl: () => ({ owner: "acme", repo: "demo" }),
}));

// ─── Route under test ───────────────────────────────────────────────────────
import { POST } from "@/app/api/portfolios/[portfolioId]/projects/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/portfolios/pf1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
    homepage: null,
  },
  readme: "",
  fileTree: [],
  dependencies: [],
};

beforeEach(() => {
  mockSteps.length = 0;
  mockInsertCalls.length = 0;
  mockAuth.mockReset();
  mockGetAuthClient.mockReset();
  mockFetchRepoData.mockReset();
  mockCredibilityFetchAll.mockReset();

  mockGetAuthClient.mockResolvedValue({} /* fake client */);
  mockFetchRepoData.mockResolvedValue(repoDataFixture);
});

describe("POST /api/portfolios/[id]/projects — GitHub branch credibility wiring", () => {
  it("persists credibility signals and fetchedAt when the fetch resolves", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    const signals = {
      schemaVersion: 1,
      ci: { status: "ok", conclusion: "success", runUrl: "x", runAt: "y" },
      recency: { status: "ok", createdAt: "a", lastPushedAt: "b" },
      releases: { status: "missing" },
      workflows: { status: "missing" },
      languages: { status: "ok", breakdown: [{ name: "TS", bytes: 1, pct: 100 }] },
      topics: { status: "missing" },
      commits: { status: "ok", total: 1, firstAt: "a", lastAt: "a" },
      contributors: { status: "ok", count: 1 },
      issuesAndPRs: { status: "ok", closedTotal: 0 },
      testFramework: { status: "missing" },
      verifiedStack: { status: "ok", items: ["Next.js"] },
    };
    mockCredibilityFetchAll.mockResolvedValue(signals);

    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [] },
      { kind: "insertProject", value: [{ id: "new-proj", repoName: "demo" }] }
    );

    const res = await POST(
      makeReq({ repoUrl: "https://github.com/acme/demo" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(201);
    expect(mockCredibilityFetchAll).toHaveBeenCalledTimes(1);

    const projectInsert = mockInsertCalls[0].rows as Record<string, unknown>;
    expect(projectInsert.sourceType).toBe("github");
    expect(projectInsert.credibilitySignals).toBe(signals);
    expect(projectInsert.credibilityFetchedAt).toBeInstanceOf(Date);
    expect(projectInsert.techStack).toEqual(["Next.js", "Drizzle ORM"]);
  });

  it("stores null for credibility when the fetch rejects", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCredibilityFetchAll.mockRejectedValue(new Error("kaboom"));

    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [] },
      { kind: "insertProject", value: [{ id: "new-proj", repoName: "demo" }] }
    );

    const res = await POST(
      makeReq({ repoUrl: "https://github.com/acme/demo" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(201);
    const projectInsert = mockInsertCalls[0].rows as Record<string, unknown>;
    expect(projectInsert.credibilitySignals).toBeNull();
    expect(projectInsert.credibilityFetchedAt).toBeNull();
  });

  it("threads session.user.id into the authenticated client helper", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-42" } });
    mockCredibilityFetchAll.mockResolvedValue({ schemaVersion: 2 });

    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "user-42" }] },
      { kind: "orders", value: [] },
      { kind: "insertProject", value: [{ id: "p", repoName: "demo" }] }
    );

    await POST(
      makeReq({ repoUrl: "https://github.com/acme/demo" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(mockGetAuthClient).toHaveBeenCalledWith("user-42");
  });

  it("persists v2 bundle with authorshipSignal when fetcher returns it", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    const v2Signals = {
      schemaVersion: 2,
      ci: { status: "missing" },
      recency: {
        status: "ok",
        createdAt: "2024-01-01T00:00:00Z",
        lastPushedAt: "2026-04-01T00:00:00Z",
      },
      releases: { status: "missing" },
      workflows: { status: "missing" },
      languages: { status: "ok", breakdown: [] },
      topics: { status: "missing" },
      commits: {
        status: "ok",
        total: 247,
        firstAt: "2024-01-01T00:00:00Z",
        lastAt: "2026-04-01T00:00:00Z",
      },
      contributors: { status: "ok", count: 3 },
      issuesAndPRs: { status: "ok", closedTotal: 12 },
      testFramework: { status: "ok", name: "jest" },
      verifiedStack: { status: "ok", items: ["Next.js"] },
      commitActivity: { status: "ok", activeDayCount: 50, totalWeeks: 52 },
      commitMessages: {
        status: "ok",
        total: 30,
        meaningfulCount: 20,
        sample: ["Add auth middleware"],
      },
      externalUrl: "https://acme.example.com",
      authorshipSignal: {
        status: "ok",
        verdict: "sustained",
        positiveCount: 5,
        factors: [],
      },
    };
    mockCredibilityFetchAll.mockResolvedValue(v2Signals);

    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [] },
      { kind: "insertProject", value: [{ id: "new-proj", repoName: "demo" }] }
    );

    const res = await POST(
      makeReq({ repoUrl: "https://github.com/acme/demo" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(201);
    const inserted = mockInsertCalls[0].rows as Record<string, unknown>;
    expect(inserted.credibilitySignals).toBe(v2Signals);
    const persisted = inserted.credibilitySignals as typeof v2Signals;
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.authorshipSignal).toMatchObject({
      status: "ok",
      verdict: "sustained",
    });
  });
});
