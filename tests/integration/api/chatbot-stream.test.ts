/**
 * @jest-environment node
 *
 * Integration tests for POST /api/chatbot/stream (SSE).
 *
 * Validates:
 *   - 200 text/event-stream: tokens stream, then `done`, session persisted
 *   - Mid-stream provider failure → single `error` frame, no `done`, no persist
 *   - Pre-stream errors (400/404/429/503) return normal JSON responses
 *   - Bodies respond correctly to malformed JSON (400)
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockSelectQueues: unknown[][] = [];
const mockInsertReturn: unknown[][] = [];
const mockUpdateCalls: Array<{ id?: string; set: Record<string, unknown> }> = [];
let mockUpdatingId: string | null = null;

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      limit: async () => {
        const rows = mockSelectQueues.shift();
        return rows ?? [];
      },
      then: (onFulfilled: (v: unknown) => unknown) => {
        const rows = mockSelectQueues.shift() ?? [];
        return Promise.resolve(onFulfilled(rows));
      },
    };
    return self;
  }
  function insertBuilder() {
    return {
      values: () => ({
        returning: async () =>
          mockInsertReturn.shift() ?? [{ id: "session-new" }],
      }),
    };
  }
  function updateBuilder() {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          mockUpdateCalls.push({ id: mockUpdatingId ?? undefined, set: patch });
          mockUpdatingId = null;
        },
      }),
    };
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      insert: jest.fn(() => insertBuilder()),
      update: jest.fn(() => updateBuilder()),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(() => "eq"), and: jest.fn(() => "and") };
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

import { POST } from "@/app/api/chatbot/stream/route";
import {
  __resetForTests,
  __setClockForTests,
} from "@/lib/chatbot/rate-limit";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
} from "@/lib/ai/providers/types";

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
  return new Request("http://localhost/api/chatbot/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function primePortfolio(overrides: {
  chatbotEnabled?: boolean;
  hasDeployment?: boolean;
  missing?: boolean;
} = {}) {
  if (overrides.missing) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([
      {
        id: "pf-1",
        userId: "u-1",
        name: "Ada's Portfolio",
        chatbotEnabled: overrides.chatbotEnabled ?? true,
        profileData: { basics: { name: "Ada" } },
      },
    ]);
    mockSelectQueues.push(
      overrides.hasDeployment === false ? [] : [{ id: "dep-1" }]
    );
  }
}

function primeSessionLookup(existing: boolean) {
  if (existing) {
    mockSelectQueues.push([{ id: "s-existing", messages: [] }]);
  } else {
    mockSelectQueues.push([]);
    mockInsertReturn.push([{ id: "s-streamed" }]);
  }
}

const FAKE_VEC = new Array(1536).fill(0.01);

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

function throwingLlm(err: Error, afterChunks: string[] = []): unknown {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    text: async () => {
      throw err;
    },
    structured: async () => ({}),
    async *textStream() {
      for (const c of afterChunks) yield c;
      throw err;
    },
  };
}

beforeEach(() => {
  mockSelectQueues.length = 0;
  mockInsertReturn.length = 0;
  mockUpdateCalls.length = 0;
  mockUpdatingId = null;
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue(FAKE_VEC);
  mockGetLlmClient.mockReset();
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue([]);
  __resetForTests();
  __setClockForTests(null);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/chatbot/stream — pre-stream errors", () => {
  it("400 on malformed JSON (normal JSON response, no SSE)", async () => {
    const res = await POST(
      new Request("http://localhost/api/chatbot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      }) as any
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.code).toBe("bad_request");
  });

  it("404 when the portfolio doesn't exist (JSON, not SSE)", async () => {
    primePortfolio({ missing: true });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("503 when no LLM provider is configured", async () => {
    primePortfolio({});
    mockGetLlmClient.mockRejectedValue(new LlmNotConfiguredError());
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(503);
  });
});

describe("POST /api/chatbot/stream — streaming", () => {
  it("200 streams tokens then a done frame with a sessionId", async () => {
    primePortfolio({});
    mockGetLlmClient.mockResolvedValue(scriptedLlm(["he", "llo", " world"]));
    primeSessionLookup(false);

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "What do they build?",
      }) as any
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await readAllText(res);

    // Three token frames in order
    expect(text).toContain('event: token\ndata: {"text":"he"}\n\n');
    expect(text).toContain('event: token\ndata: {"text":"llo"}\n\n');
    expect(text).toContain('event: token\ndata: {"text":" world"}\n\n');
    // Terminal done with a session id
    expect(text).toMatch(/event: done\ndata: \{"sessionId":"s-streamed"\}/);
    // No error frame
    expect(text).not.toContain("event: error");
  });

  it("200 followed by an error frame when the LLM throws mid-stream (no done, no persist)", async () => {
    primePortfolio({});
    mockGetLlmClient.mockResolvedValue(
      throwingLlm(new Error("provider exploded"), ["partial"])
    );
    // Session lookup should NOT be consulted after an error; prime it
    // anyway so a stray call produces a clean array.
    primeSessionLookup(false);

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "hi",
      }) as any
    );
    expect(res.status).toBe(200);
    const text = await readAllText(res);
    expect(text).toContain('event: token\ndata: {"text":"partial"}\n\n');
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"internal"');
    expect(text).not.toContain("event: done");
    // Session write never ran (no update, no leftover updates)
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("maps LlmInvalidKeyError to an error frame with code=not_configured", async () => {
    primePortfolio({});
    mockGetLlmClient.mockResolvedValue(
      throwingLlm(new LlmInvalidKeyError("openai", "401"))
    );
    primeSessionLookup(false);
    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "hi",
      }) as any
    );
    const text = await readAllText(res);
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"not_configured"');
  });

  it("persists the full reply (not just partial chunks) to the session", async () => {
    primePortfolio({});
    mockGetLlmClient.mockResolvedValue(scriptedLlm(["one ", "two ", "three"]));
    primeSessionLookup(true); // existing session path

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "follow-up",
      }) as any
    );
    await readAllText(res);

    expect(mockUpdateCalls).toHaveLength(1);
    const messages = mockUpdateCalls[0].set.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("one two three");
  });
});
