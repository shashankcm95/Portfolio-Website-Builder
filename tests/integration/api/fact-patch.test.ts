/**
 * @jest-environment node
 *
 * Phase 10 — Track F. Integration tests for
 *   PATCH /api/portfolios/:portfolioId/projects/:projectId/facts/:factId
 *
 * Asserts:
 *   - 401 when unauthenticated
 *   - 404 when the fact doesn't exist
 *   - 403 when the fact belongs to another user
 *   - 400 on invalid fields (claim too long, bad category, bad confidence)
 *   - 200 happy path — fact is updated and `ownerEdited` flips to true
 *   - Round-trip: response body echoes the patched values + `ownerEdited: true`
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: (...a: unknown[]) => mockAuth(...a),
}));

type Step =
  | { kind: "authSelect"; value: unknown[] }
  | { kind: "update"; value: unknown[] };

const mockSteps: Step[] = [];
const mockSet = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    select: jest.fn(() => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => {
          const step = mockSteps.shift();
          if (step?.kind !== "authSelect")
            throw new Error(
              `Expected authSelect step, got ${step?.kind ?? "undefined"}`
            );
          return step.value;
        },
      };
      return chain;
    }),
    update: jest.fn(() => ({
      set: (patch: unknown) => {
        mockSet(patch);
        return {
          where: () => ({
            returning: async () => {
              const step = mockSteps.shift();
              if (step?.kind !== "update")
                throw new Error(
                  `Expected update step, got ${step?.kind ?? "undefined"}`
                );
              return step.value;
            },
          }),
        };
      },
    })),
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

import { PATCH } from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/facts/[factId]/route";

function makeReq(body: unknown | string) {
  return new Request(
    "http://localhost/api/portfolios/po1/projects/pr1/facts/f1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  );
}

function params() {
  return {
    params: { portfolioId: "po1", projectId: "pr1", factId: "f1" },
  } as any;
}

function factRow(overrides: Record<string, unknown> = {}) {
  return {
    fact: {
      id: "f1",
      projectId: "pr1",
      claim: "Original claim",
      category: "tech_stack",
      confidence: 0.7,
      evidenceType: "code",
      evidenceRef: "src/index.ts",
      evidenceText: "",
      isVerified: false,
      ownerEdited: false,
      ...overrides,
    },
    portfolioUserId: "u1",
    portfolioId: "po1",
    projectId: "pr1",
  };
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockSet.mockClear();
});

describe("PATCH /api/portfolios/:portfolioId/projects/:projectId/facts/:factId", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = (await PATCH(makeReq({ claim: "x" }) as any, params()))!;
    expect(res.status).toBe(401);
  });

  it("returns 404 when the fact does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [] });
    const res = (await PATCH(makeReq({ claim: "new claim" }) as any, params()))!;
    expect(res.status).toBe(404);
  });

  it("returns 403 when the fact belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [{ ...factRow(), portfolioUserId: "u2" }],
    });
    const res = (await PATCH(makeReq({ claim: "new claim" }) as any, params()))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is not JSON", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const res = (await PATCH(makeReq("not json{") as any, params()))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 when no fields are provided", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const res = (await PATCH(makeReq({}) as any, params()))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 when claim exceeds 500 chars", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const longClaim = "x".repeat(501);
    const res = (await PATCH(makeReq({ claim: longClaim }) as any, params()))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 when claim is blank", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const res = (await PATCH(makeReq({ claim: "   " }) as any, params()))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 when confidence is out of range", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const res = (await PATCH(makeReq({ confidence: 1.5 }) as any, params()))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is too long", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [factRow()] });
    const longCategory = "y".repeat(101);
    const res = (await PATCH(
      makeReq({ category: longCategory }) as any,
      params()
    ))!;
    expect(res.status).toBe(400);
  });

  it("happy path — updates fact and marks ownerEdited=true", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "authSelect", value: [factRow()] },
      {
        kind: "update",
        value: [
          {
            id: "f1",
            claim: "Updated claim",
            category: "architecture",
            confidence: 0.95,
            ownerEdited: true,
          },
        ],
      }
    );
    const res = (await PATCH(
      makeReq({
        claim: "Updated claim",
        category: "architecture",
        confidence: 0.95,
      }) as any,
      params()
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fact).toMatchObject({
      claim: "Updated claim",
      category: "architecture",
      confidence: 0.95,
      ownerEdited: true,
    });
    // Round-trip: the update payload carries the patched fields plus
    // the ownerEdited flip.
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: "Updated claim",
        category: "architecture",
        confidence: 0.95,
        ownerEdited: true,
      })
    );
  });

  it("partial patch — only confidence changes, other fields untouched", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "authSelect", value: [factRow()] },
      {
        kind: "update",
        value: [
          {
            id: "f1",
            claim: "Original claim",
            category: "tech_stack",
            confidence: 0.3,
            ownerEdited: true,
          },
        ],
      }
    );
    const res = (await PATCH(makeReq({ confidence: 0.3 }) as any, params()))!;
    expect(res.status).toBe(200);
    const call = mockSet.mock.calls[0][0];
    expect(call).toEqual(
      expect.objectContaining({ confidence: 0.3, ownerEdited: true })
    );
    expect(call).not.toHaveProperty("claim");
    expect(call).not.toHaveProperty("category");
  });
});
