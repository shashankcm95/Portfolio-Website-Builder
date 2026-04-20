/**
 * @jest-environment node
 *
 * Integration tests for POST /api/portfolios/:id/projects — focused on the
 * manual (non-GitHub) branch added in Wave 3B. Drizzle is mocked so we can
 * cover auth, validation, ownership, and insert semantics without spinning
 * up Postgres.
 */

// Jest hoists jest.mock() factories above the top of the file, so any
// variable referenced inside the factory must be (a) a literal or (b)
// prefixed with `mock` to bypass the safety check. We use (b).

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

// Queue of expected drizzle chain results. Each route call pushes steps in
// the order the route awaits them (ownership → orders → insertProject).
type Step =
  | { kind: "ownership"; value: unknown[] }
  | { kind: "orders"; value: Array<{ displayOrder: number | null }> }
  | { kind: "insertProject"; value: unknown[] };

const mockSteps: Step[] = [];
const mockInsertFn = jest.fn();

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
    insert: (...args: unknown[]) => {
      mockInsertFn(...args);
      return {
        values: (rows: unknown) => ({
          returning: async () => {
            const step = mockSteps.shift();
            if (step?.kind !== "insertProject")
              throw new Error(
                `Expected insertProject step, got ${step?.kind ?? "undefined"}: rows=${JSON.stringify(rows)}`
              );
            return step.value;
          },
        }),
      };
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
  };
});

import { POST } from "@/app/api/portfolios/[portfolioId]/projects/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/portfolios/pf1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockInsertFn.mockClear();
});

describe("POST /api/portfolios/[id]/projects — manual branch", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ sourceType: "manual" }) as any, {
      params: { portfolioId: "pf1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the portfolio does not belong to the user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "ownership", value: [] });
    const res = await POST(makeReq({ sourceType: "manual" }) as any, {
      params: { portfolioId: "pf1" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("rejects missing name", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [] }
    );
    const res = await POST(
      makeReq({ sourceType: "manual", description: "hi" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it("rejects missing description", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [] }
    );
    const res = await POST(
      makeReq({ sourceType: "manual", name: "Acme" }) as any,
      { params: { portfolioId: "pf1" } } as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it("inserts a manual project with sourceType=manual and pipelineStatus=complete", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      { kind: "ownership", value: [{ id: "pf1", userId: "u1" }] },
      { kind: "orders", value: [{ displayOrder: 0 }, { displayOrder: 2 }] },
      {
        kind: "insertProject",
        value: [
          {
            id: "new-proj",
            portfolioId: "pf1",
            sourceType: "manual",
            displayName: "Acme Redesign",
            manualDescription: "Design overhaul.",
            displayOrder: 3,
            pipelineStatus: "complete",
          },
        ],
      }
    );

    const res = await POST(
      makeReq({
        sourceType: "manual",
        name: "Acme Redesign",
        description: "Design overhaul.",
        techStack: ["Figma", "React"],
        externalUrl: "https://acme.example.com",
        imageUrl: "",
      }) as any,
      { params: { portfolioId: "pf1" } } as any
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project).toMatchObject({
      id: "new-proj",
      sourceType: "manual",
      pipelineStatus: "complete",
    });
    expect(mockInsertFn).toHaveBeenCalledTimes(1);
  });
});
