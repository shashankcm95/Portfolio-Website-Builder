/**
 * @jest-environment node
 *
 * POST /api/projects/:projectId/storyboard/regenerate — auth, ownership,
 * throttle, idempotent upsert via mocked step.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type OwnershipStep = { kind: "ownership"; value: unknown[] };
type ExistingStep = { kind: "existing"; value: unknown[] };

const mockSteps: Array<OwnershipStep | ExistingStep> = [];

jest.mock("@/lib/db", () => {
  function chain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
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

const mockRunStoryboard = jest.fn();
jest.mock("@/lib/pipeline/steps/storyboard-generate", () => ({
  runStoryboardGenerate: (...a: unknown[]) => mockRunStoryboard(...a),
}));

import { POST } from "@/app/api/projects/[projectId]/storyboard/regenerate/route";

function makeReq() {
  return new Request(
    "http://localhost/api/projects/p1/storyboard/regenerate",
    { method: "POST" }
  );
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockRunStoryboard.mockReset();
});

describe("POST /api/projects/:projectId/storyboard/regenerate", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq() as any, {
      params: { projectId: "p1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when project does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "ownership", value: [] });
    const res = await POST(makeReq() as any, {
      params: { projectId: "nope" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when project belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "ownership",
      value: [{ projectId: "p1", portfolioUserId: "u2" }],
    });
    const res = await POST(makeReq() as any, {
      params: { projectId: "p1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("returns 429 when regenerated less than 30 seconds ago", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "ownership",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      {
        kind: "existing",
        value: [{ updatedAt: new Date(Date.now() - 5000) }],
      }
    );
    const res = await POST(makeReq() as any, {
      params: { projectId: "p1" },
    } as any);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(mockRunStoryboard).not.toHaveBeenCalled();
  });

  it("returns 500 when the step reports a non-fatal error", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "ownership",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      { kind: "existing", value: [] }
    );
    mockRunStoryboard.mockResolvedValue({ ok: false, error: "LLM down" });
    const res = await POST(makeReq() as any, {
      params: { projectId: "p1" },
    } as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/LLM down/);
  });

  it("returns 200 with the storyboard on successful regenerate", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const fakePayload = {
      schemaVersion: 1,
      cards: [],
      mermaid: "graph TD",
    };
    mockSteps.push(
      {
        kind: "ownership",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      { kind: "existing", value: [] }
    );
    mockRunStoryboard.mockResolvedValue({ ok: true, payload: fakePayload });
    const res = await POST(makeReq() as any, {
      params: { projectId: "p1" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storyboard).toEqual(fakePayload);
    expect(mockRunStoryboard).toHaveBeenCalledWith("p1");
  });
});
