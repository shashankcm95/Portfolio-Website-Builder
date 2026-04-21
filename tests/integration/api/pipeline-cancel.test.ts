/**
 * @jest-environment node
 *
 * POST /api/portfolios/:portfolioId/projects/:projectId/pipeline/cancel
 *
 * Covers:
 *  - 401 unauthenticated
 *  - 403 when portfolio belongs to another user
 *  - 404 when no pipeline is running for the project
 *  - 200 when the orchestrator aborts a running pipeline
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type DbStep = { value: unknown[] };
const mockSteps: DbStep[] = [];

jest.mock("@/lib/db", () => {
  function chain() {
    const self: any = {
      from: () => self,
      where: () => self,
      limit: async () => {
        const step = mockSteps.shift();
        if (!step) throw new Error("No DB step queued");
        return step.value;
      },
    };
    return self;
  }
  return { db: { select: jest.fn(() => chain()) } };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
  };
});

const mockCancel = jest.fn();
jest.mock("@/lib/pipeline/orchestrator", () => ({
  cancelPipeline: (...a: unknown[]) => mockCancel(...a),
}));

import { POST } from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/pipeline/cancel/route";

function makeReq() {
  return new Request(
    "http://localhost/api/portfolios/portfolio-1/projects/project-1/pipeline/cancel",
    { method: "POST" }
  );
}

function makeParams() {
  return { params: { portfolioId: "portfolio-1", projectId: "project-1" } } as any;
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockCancel.mockReset();
});

describe("POST /api/portfolios/:portfolioId/projects/:projectId/pipeline/cancel", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq() as any, makeParams());
    expect(res.status).toBe(401);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("returns 403 when portfolio does not belong to the session user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    // Ownership query returns empty because the `and(eq userId)` guard
    // filtered the portfolio out.
    mockSteps.push({ value: [] });

    const res = await POST(makeReq() as any, makeParams());
    expect(res.status).toBe(403);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("returns 404 when no pipeline is running for the project", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockSteps.push({ value: [{ id: "portfolio-1", userId: "user-1" }] });
    mockSteps.push({ value: [{ id: "project-1", portfolioId: "portfolio-1" }] });
    mockCancel.mockReturnValue(false);

    const res = await POST(makeReq() as any, makeParams());
    expect(res.status).toBe(404);
    expect(mockCancel).toHaveBeenCalledWith("project-1");
  });

  it("returns 200 and aborts the running pipeline", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockSteps.push({ value: [{ id: "portfolio-1", userId: "user-1" }] });
    mockSteps.push({ value: [{ id: "project-1", portfolioId: "portfolio-1" }] });
    mockCancel.mockReturnValue(true);

    const res = await POST(makeReq() as any, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, status: "cancelled" });
    expect(mockCancel).toHaveBeenCalledWith("project-1");
  });
});
