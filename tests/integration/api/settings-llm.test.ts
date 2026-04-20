/**
 * @jest-environment node
 *
 * GET/PUT/DELETE /api/settings/llm — auth, model allowlist validation,
 * validate-on-save flow, idempotent clear. Drizzle + validateKey mocked.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

// Drizzle mock: separate queues for select.limit() and update(...).where
const mockSelectRows: Array<Record<string, unknown>> = [];
const mockUpdateCalls: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      where: () => self,
      limit: async () => mockSelectRows.slice(),
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      update: jest.fn(() => ({
        set: (patch: unknown) => ({
          where: async () => {
            mockUpdateCalls.push(patch as Record<string, unknown>);
          },
        }),
      })),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq") };
});

const mockValidateKey = jest.fn();
jest.mock("@/lib/ai/providers/validate-key", () => ({
  validateKey: (...a: unknown[]) => mockValidateKey(...a),
}));

import {
  DELETE,
  GET,
  PUT,
} from "@/app/api/settings/llm/route";

function makePut(body: unknown) {
  return new Request("http://localhost/api/settings/llm", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectRows.length = 0;
  mockUpdateCalls.length = 0;
  mockValidateKey.mockReset();
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/settings/llm", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns hasKey=false when no BYOK row exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      provider: null,
      model: null,
      hasKey: false,
      lastValidatedAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
    });
  });

  it("returns hasKey=true without plaintext when key is set", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockSelectRows.push({
      provider: "openai",
      keyEncrypted: "v1:iv:ct:tag",
      model: "gpt-4o-mini",
      lastValidatedAt: new Date("2026-04-19T00:00:00Z"),
      lastFailureAt: null,
      lastFailureReason: null,
    });
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      hasKey: true,
      lastValidatedAt: "2026-04-19T00:00:00.000Z",
    });
    // CRITICAL: plaintext key must NEVER appear in response
    expect(JSON.stringify(body)).not.toMatch(/v1:iv:ct:tag/);
  });
});

// ─── PUT ────────────────────────────────────────────────────────────────────

describe("PUT /api/settings/llm", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PUT(
      makePut({ provider: "openai", apiKey: "sk-xyzzy12345", model: "gpt-4o-mini" }) as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://localhost/api/settings/llm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 on unknown provider", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PUT(
      makePut({ provider: "groq", apiKey: "x", model: "y" }) as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown provider/i);
  });

  it("returns 400 on too-short api key", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PUT(
      makePut({ provider: "openai", apiKey: "sk", model: "gpt-4o-mini" }) as any
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on model not in allowlist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await PUT(
      makePut({
        provider: "openai",
        apiKey: "sk-abc12345678",
        model: "gpt-imaginary",
      }) as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/allowlist/i);
    expect(Array.isArray(body.allowed)).toBe(true);
  });

  it("returns 400 and records failure when validateKey rejects", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockValidateKey.mockResolvedValue({
      ok: false,
      reason: "Invalid API key for this provider.",
      category: "invalid_key",
    });

    const res = await PUT(
      makePut({
        provider: "openai",
        apiKey: "sk-abc12345678",
        model: "gpt-4o-mini",
      }) as any
    );
    expect(res.status).toBe(400);
    // Failure columns updated
    expect(mockUpdateCalls).toHaveLength(1);
    const patch = mockUpdateCalls[0];
    expect(patch.byokKeyLastFailureAt).toBeInstanceOf(Date);
    expect(patch.byokKeyLastFailureReason).toMatch(/invalid/i);
    // Encrypted key must NOT have been touched
    expect(patch.byokKeyEncrypted).toBeUndefined();
  });

  it("persists + returns 200 on successful validate", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockValidateKey.mockResolvedValue({ ok: true });

    const res = await PUT(
      makePut({
        provider: "openai",
        apiKey: "sk-abcdefghij12345678",
        model: "gpt-4o-mini",
      }) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      hasKey: true,
    });

    // Encrypted key written, failure columns cleared
    expect(mockUpdateCalls).toHaveLength(1);
    const patch = mockUpdateCalls[0];
    expect(typeof patch.byokKeyEncrypted).toBe("string");
    expect(patch.byokKeyEncrypted).toMatch(/^v1:/);
    expect(patch.byokKeyLastFailureAt).toBeNull();
    expect(patch.byokKeyLastFailureReason).toBeNull();
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /api/settings/llm", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("nulls all six byok columns", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(mockUpdateCalls).toHaveLength(1);
    const patch = mockUpdateCalls[0];
    expect(patch).toMatchObject({
      byokProvider: null,
      byokKeyEncrypted: null,
      byokModel: null,
      byokKeyLastValidatedAt: null,
      byokKeyLastFailureAt: null,
      byokKeyLastFailureReason: null,
    });
  });
});
