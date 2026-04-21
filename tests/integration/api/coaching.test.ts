/**
 * @jest-environment node
 *
 * Integration tests for PATCH /api/portfolios/:pid/projects/:prid/coaching.
 * Drizzle is mocked; the route is otherwise exercised end-to-end.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

type Step =
  | { kind: "authSelect"; value: unknown[] }
  | { kind: "update"; value: unknown[] };

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
          where: () => ({
            returning: async () => {
              const step = mockSteps.shift();
              if (step?.kind !== "update")
                throw new Error(`Expected update, got ${step?.kind}`);
              return step.value;
            },
          }),
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

import { PATCH } from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/coaching/route";

function makeReq(body: unknown): any {
  return {
    json: async () => body,
  };
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockSetCapture.mockReset();
});

describe("PATCH /coaching", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeReq({ category: "personal_tool" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(
      { json: async () => { throw new Error("bad"); } } as any,
      { params: { portfolioId: "pf1", projectId: "p1" } } as any
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown category", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(makeReq({ category: "wildly-invalid" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no known fields are present", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(makeReq({ foo: "bar" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 when project does not belong to the portfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [] });
    const res = await PATCH(makeReq({ category: "personal_tool" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [{ projectId: "p1", portfolioUserId: "u2" }],
    });
    const res = await PATCH(makeReq({ category: "personal_tool" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("stamps source=manual when the category is changed", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "authSelect",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      {
        kind: "update",
        value: [
          {
            projectCategory: "personal_tool",
            projectCategorySource: "manual",
            dismissedSuggestions: [],
            showCharacterizationOnPortfolio: false,
          },
        ],
      }
    );
    const res = await PATCH(makeReq({ category: "personal_tool" }), {
      params: { portfolioId: "pf1", projectId: "p1" },
    } as any);
    expect(res.status).toBe(200);
    expect(mockSetCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        projectCategory: "personal_tool",
        projectCategorySource: "manual",
      })
    );
  });

  it("dedupes and caps dismissedSuggestions", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "authSelect",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      {
        kind: "update",
        value: [
          {
            projectCategory: "unspecified",
            projectCategorySource: "auto",
            dismissedSuggestions: ["a", "b"],
            showCharacterizationOnPortfolio: false,
          },
        ],
      }
    );
    const res = await PATCH(
      makeReq({ dismissedSuggestions: ["a", "a", "b", "a", "b"] }),
      { params: { portfolioId: "pf1", projectId: "p1" } } as any
    );
    expect(res.status).toBe(200);
    const call = mockSetCapture.mock.calls[0][0];
    expect(call.dismissedSuggestions).toEqual(["a", "b"]);
  });

  it("rejects non-string values in dismissedSuggestions", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(
      makeReq({ dismissedSuggestions: ["a", 123] }),
      { params: { portfolioId: "pf1", projectId: "p1" } } as any
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-boolean showCharacterizationOnPortfolio", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PATCH(
      makeReq({ showCharacterizationOnPortfolio: "yes" }),
      { params: { portfolioId: "pf1", projectId: "p1" } } as any
    );
    expect(res.status).toBe(400);
  });

  it("accepts a subset of fields (partial PATCH)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "authSelect",
        value: [{ projectId: "p1", portfolioUserId: "u1" }],
      },
      {
        kind: "update",
        value: [
          {
            projectCategory: "unspecified",
            projectCategorySource: "auto",
            dismissedSuggestions: [],
            showCharacterizationOnPortfolio: true,
          },
        ],
      }
    );
    const res = await PATCH(
      makeReq({ showCharacterizationOnPortfolio: true }),
      { params: { portfolioId: "pf1", projectId: "p1" } } as any
    );
    expect(res.status).toBe(200);
    const call = mockSetCapture.mock.calls[0][0];
    expect(call).toEqual(
      expect.objectContaining({ showCharacterizationOnPortfolio: true })
    );
    // Must NOT stamp category/source when category isn't in the patch
    expect(call.projectCategory).toBeUndefined();
    expect(call.projectCategorySource).toBeUndefined();
  });
});
