/**
 * @jest-environment node
 *
 * Integration tests for POST /api/chatbot/owner-ask/stream.
 *
 * Key differences from the visitor stream route:
 *   - auth + ownership required (401 / 403)
 *   - does NOT require a deployment (owners iterate on drafts)
 *   - does NOT persist to chatbot_sessions
 *   - separate light rate limit ("owner" scope)
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: (...a: unknown[]) => mockAuth(...a),
}));

const mockSelectQueues: unknown[][] = [];
const mockInsertCalls: unknown[][] = [];
const mockUpdateCalls: unknown[] = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      limit: async () => mockSelectQueues.shift() ?? [],
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(onFulfilled(mockSelectQueues.shift() ?? [])),
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => ({
        values: () => ({
          returning: async () => {
            mockInsertCalls.push([]);
            return [{ id: "MUST-NOT-BE-CALLED" }];
          },
        }),
      })),
      update: jest.fn(() => ({
        set: () => ({
          where: async () => {
            mockUpdateCalls.push({});
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

const mockGenerateEmbedding = jest.fn();
jest.mock("@/lib/ai/openai", () => ({
  generateEmbedding: (...a: unknown[]) => mockGenerateEmbedding(...a),
}));

const mockGetLlmClient = jest.fn();
jest.mock("@/lib/ai/providers/factory", () => ({
  getLlmClientForUser: (...a: unknown[]) => mockGetLlmClient(...a),
}));

const mockRetrieve = jest.fn();
jest.mock("@/lib/chatbot/retrieve", () => ({
  retrieveTopK: (...a: unknown[]) => mockRetrieve(...a),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { POST } from "@/app/api/chatbot/owner-ask/stream/route";
import {
  __resetForTests,
  __setClockForTests,
} from "@/lib/chatbot/rate-limit";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readAllText(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chatbot/owner-ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function scriptedLlm(chunks: string[]): unknown {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    text: async () => chunks.join(""),
    structured: async () => ({}),
    async *textStream() {
      for (const c of chunks) yield c;
    },
  };
}

const FAKE_VEC = new Array(1536).fill(0.01);

beforeEach(() => {
  mockAuth.mockReset();
  mockSelectQueues.length = 0;
  mockInsertCalls.length = 0;
  mockUpdateCalls.length = 0;
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue(FAKE_VEC);
  mockGetLlmClient.mockReset();
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue([]);
  __resetForTests();
  __setClockForTests(null);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/chatbot/owner-ask/stream — auth + ownership", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      makeReq({ portfolioId: "pf-1", message: "hi" }) as any
    );
    expect(res.status).toBe(401);
  });

  it("403 when the portfolio belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-me" } });
    mockSelectQueues.push([
      {
        id: "pf-1",
        userId: "u-someone-else",
        name: "Other Portfolio",
        profileData: {},
      },
    ]);
    const res = await POST(
      makeReq({ portfolioId: "pf-1", message: "hi" }) as any
    );
    expect(res.status).toBe(403);
  });

  it("404 when the portfolio doesn't exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });
    mockSelectQueues.push([]);
    const res = await POST(
      makeReq({ portfolioId: "pf-missing", message: "hi" }) as any
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/chatbot/owner-ask/stream — validation", () => {
  it("400 on missing message", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });
    const res = await POST(makeReq({ portfolioId: "pf-1" }) as any);
    expect(res.status).toBe(400);
  });

  it("400 on oversize seedContext", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });
    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        message: "hi",
        seedContext: "x".repeat(2001),
      }) as any
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chatbot/owner-ask/stream — streaming", () => {
  it("200 streams tokens + a final done frame, does NOT persist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });
    mockSelectQueues.push([
      {
        id: "pf-1",
        userId: "u-1",
        name: "Ada's Portfolio",
        profileData: { basics: { name: "Ada" } },
      },
    ]);
    mockGetLlmClient.mockResolvedValue(scriptedLlm(["here ", "is ", "advice"]));

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        message: "help me add CI",
        seedContext: "Add GitHub Actions CI to this repo",
      }) as any
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await readAllText(res);

    expect(text).toContain('event: token\ndata: {"text":"here "}\n\n');
    expect(text).toContain('event: token\ndata: {"text":"is "}\n\n');
    expect(text).toContain('event: token\ndata: {"text":"advice"}\n\n');
    expect(text).toContain("event: done");

    // No session persisted — no insert / update calls fired.
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("emits an error frame on mid-stream LLM failure", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u-1" } });
    mockSelectQueues.push([
      { id: "pf-1", userId: "u-1", name: "P", profileData: {} },
    ]);
    mockGetLlmClient.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o-mini",
      text: async () => "",
      structured: async () => ({}),
      async *textStream() {
        yield "partial";
        throw new Error("boom");
      },
    });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", message: "hi" }) as any
    );
    const text = await readAllText(res);
    expect(text).toContain('event: token\ndata: {"text":"partial"}\n\n');
    expect(text).toContain("event: error");
    expect(text).not.toContain("event: done");
  });
});
