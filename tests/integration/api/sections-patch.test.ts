/**
 * @jest-environment node
 *
 * Integration tests for PATCH /api/projects/:projectId/sections/:sectionId.
 * This endpoint was created in Wave 1A to fix Marcus's silent-save failure —
 * we verify auth traversal (section → project → portfolio → userId) and the
 * update semantics (sets userContent + isUserEdited).
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

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

import { PATCH } from "@/app/api/projects/[projectId]/sections/[sectionId]/route";

function makeReq(body: unknown | string) {
  return new Request("http://localhost/api/projects/p1/sections/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSteps.length = 0;
  mockAuth.mockReset();
  mockSet.mockClear();
});

describe("PATCH /api/projects/:projectId/sections/:sectionId", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeReq({ userContent: "new" }) as any, {
      params: { projectId: "p1", sectionId: "s1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the section does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({ kind: "authSelect", value: [] });
    const res = await PATCH(makeReq({ userContent: "new" }) as any, {
      params: { projectId: "p1", sectionId: "s1" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the section belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          section: { id: "s1" },
          projectId: "p1",
          portfolioUserId: "u2", // different user
        },
      ],
    });
    const res = await PATCH(makeReq({ userContent: "new" }) as any, {
      params: { projectId: "p1", sectionId: "s1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is not JSON", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          section: { id: "s1" },
          projectId: "p1",
          portfolioUserId: "u1",
        },
      ],
    });
    const res = await PATCH(makeReq("not json{") as any, {
      params: { projectId: "p1", sectionId: "s1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when userContent is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push({
      kind: "authSelect",
      value: [
        {
          section: { id: "s1" },
          projectId: "p1",
          portfolioUserId: "u1",
        },
      ],
    });
    const res = await PATCH(makeReq({}) as any, {
      params: { projectId: "p1", sectionId: "s1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("updates the section and marks it user-edited", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSteps.push(
      {
        kind: "authSelect",
        value: [
          {
            section: { id: "s1", userContent: null, isUserEdited: false },
            projectId: "p1",
            portfolioUserId: "u1",
          },
        ],
      },
      {
        kind: "update",
        value: [
          {
            id: "s1",
            userContent: "edited text",
            isUserEdited: true,
          },
        ],
      }
    );
    const res = await PATCH(
      makeReq({ userContent: "edited text" }) as any,
      { params: { projectId: "p1", sectionId: "s1" } } as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.section).toMatchObject({
      userContent: "edited text",
      isUserEdited: true,
    });
    // Verify the .set() call carries both the content and the flag
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: "edited text",
        isUserEdited: true,
      })
    );
  });
});
