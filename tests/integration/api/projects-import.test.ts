/**
 * @jest-environment node
 *
 * Integration tests for POST /api/portfolios/:portfolioId/projects/import.
 * Drizzle, the importSingleRepo helper, and the LLM pre-flight are mocked.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type Step =
  | { kind: "portfolio"; value: unknown[] }
  | { kind: "existingProjects"; value: Array<{ repoOwner: string | null; repoName: string | null }> }
  | { kind: "orders"; value: Array<{ displayOrder: number | null }> };

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
              if (step?.kind === "existingProjects" || step?.kind === "orders") {
                return Promise.resolve(onFulfilled(step.value));
              }
              throw new Error(
                `Expected existingProjects or orders, got ${step?.kind ?? "undefined"}`
              );
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

// Mock the importSingleRepo helper so we don't need to thread through the
// entire GitHub + credibility pipeline. The route-level test's job is to
// verify batching, partial failure, and dedupe — not to re-prove the
// single-repo insert.
const mockImportSingleRepo = jest.fn();
jest.mock("@/lib/projects/import-single-repo", () => ({
  importSingleRepo: (...a: unknown[]) => mockImportSingleRepo(...a),
}));

const mockHasLlm = jest.fn();
jest.mock("@/lib/ai/providers/factory", () => ({
  hasLlmConfigForUser: (...a: unknown[]) => mockHasLlm(...a),
}));

const mockStartPipeline = jest.fn();
jest.mock("@/lib/pipeline/orchestrator", () => ({
  startPipeline: (...a: unknown[]) => mockStartPipeline(...a),
}));

import { POST } from "@/app/api/portfolios/[portfolioId]/projects/import/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/portfolios/pf1/projects/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockImportSingleRepo.mockReset();
  mockHasLlm.mockReset();
  mockStartPipeline.mockReset();
  mockHasLlm.mockResolvedValue(true);
});

describe("POST /api/portfolios/:pid/projects/import", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq({ repos: [{ owner: "octocat", name: "a" }] }) as any,
      { params: { portfolioId: "pf1" } } as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the portfolio does not exist for this user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "portfolio", value: [] });
    const res = await POST(
      makeReq({ repos: [{ owner: "octocat", name: "a" }] }) as any,
      { params: { portfolioId: "pf1" } } as any
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the body has zero repos", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "portfolio", value: [{ id: "pf1", userId: "u1" }] });
    const res = await POST(makeReq({ repos: [] }) as any, {
      params: { portfolioId: "pf1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the body has more than 10 repos", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "portfolio", value: [{ id: "pf1", userId: "u1" }] });
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      owner: "octocat",
      name: `r${i}`,
    }));
    const res = await POST(makeReq({ repos: tooMany }) as any, {
      params: { portfolioId: "pf1" },
    } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/max 10/i);
  });

  it("returns 409 when no LLM provider is configured", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockHasLlm.mockResolvedValue(false);
    mockSteps.push({
      kind: "portfolio",
      value: [{ id: "pf1", userId: "u1" }],
    });
    const res = await POST(
      makeReq({ repos: [{ owner: "octocat", name: "a" }] }) as any,
      { params: { portfolioId: "pf1" } } as any
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("llm_not_configured");
  });

  it("returns 200 with mixed statuses for imported + skipped + failed repos", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });

    // One already-imported, one fresh success, one fresh failure.
    mockSteps.push(
      { kind: "portfolio", value: [{ id: "pf1", userId: "u1" }] },
      {
        kind: "existingProjects",
        value: [{ repoOwner: "octocat", repoName: "dup" }],
      },
      { kind: "orders", value: [{ displayOrder: 2 }] }
    );

    mockImportSingleRepo.mockImplementation(
      async (_pf: string, _owner: string, name: string) => {
        if (name === "boom") throw new Error("simulated failure");
        return {
          project: { id: `pid-${name}`, repoName: name },
          repoMetadata: { name, fullName: `octocat/${name}` },
        };
      }
    );

    const res = await POST(
      makeReq({
        repos: [
          { owner: "octocat", name: "dup" },
          { owner: "octocat", name: "good" },
          { owner: "octocat", name: "boom" },
        ],
      }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const byName = Object.fromEntries(
      (body.results as any[]).map((r) => [r.name, r])
    );

    expect(byName.dup.status).toBe("skipped");
    expect(byName.good.status).toBe("imported");
    expect(byName.good.projectId).toBe("pid-good");
    expect(byName.boom.status).toBe("failed");
    expect(byName.boom.reason).toMatch(/simulated/i);

    // importSingleRepo is NOT called for the already-imported row
    const calledWith = mockImportSingleRepo.mock.calls.map((c) => c[2]);
    expect(calledWith).not.toContain("dup");
    expect(calledWith).toEqual(expect.arrayContaining(["good", "boom"]));

    // Pipeline kicked off for the successful import only
    expect(mockStartPipeline).toHaveBeenCalledTimes(1);
    expect(mockStartPipeline).toHaveBeenCalledWith("pid-good");
  });

  it("dedupes repeated (owner, name) pairs in the request", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "portfolio", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "existingProjects", value: [] },
      { kind: "orders", value: [] }
    );
    mockImportSingleRepo.mockImplementation(
      async (_pf: string, _owner: string, name: string) => ({
        project: { id: `pid-${name}`, repoName: name },
        repoMetadata: { name, fullName: `octocat/${name}` },
      })
    );

    const res = await POST(
      makeReq({
        repos: [
          { owner: "octocat", name: "a" },
          { owner: "OCTOCAT", name: "A" }, // same key, different case
          { owner: "octocat", name: "b" },
        ],
      }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(mockImportSingleRepo).toHaveBeenCalledTimes(2);
  });
});
