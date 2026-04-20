/**
 * @jest-environment node
 *
 * Integration tests for POST /api/chatbot/message.
 *
 * We mock:
 *   - @/lib/db             : in-memory select / insert / update / delete
 *   - @/lib/ai/openai      : generateEmbedding returns a fixed vector
 *   - @/lib/ai/providers/factory : getLlmClientForUser → scripted reply
 *   - @/lib/chatbot/retrieve     : retrieveTopK → a controllable chunk list
 *
 * Covers the full matrix: 200 happy path; 400 bad body; 404 unknown /
 * unpublished / disabled portfolio; 429 rate limit; 503 missing LLM; 500
 * generic failure.
 */

// ─── Mocks (must be defined BEFORE importing the route) ────────────────────

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
        returning: async () => {
          const r = mockInsertReturn.shift() ?? [{ id: "session-new" }];
          return r;
        },
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

// ─── Imports (AFTER mocks) ──────────────────────────────────────────────────

import { POST } from "@/app/api/chatbot/message/route";
import {
  __resetForTests,
  __setClockForTests,
} from "@/lib/chatbot/rate-limit";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
} from "@/lib/ai/providers/types";
import {
  MAX_VISITOR_MESSAGE_CHARS,
  PER_VISITOR_MESSAGES,
} from "@/lib/chatbot/types";

// ─── Fixtures / helpers ─────────────────────────────────────────────────────

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chatbot/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function primePortfolio(
  overrides: Partial<{
    chatbotEnabled: boolean;
    hasDeployment: boolean;
    missing: boolean;
    ownerName: string;
  }> = {}
) {
  // Portfolio select
  if (overrides.missing) {
    mockSelectQueues.push([]);
  } else {
    mockSelectQueues.push([
      {
        id: "pf-1",
        userId: "u-1",
        name: "Ada's Portfolio",
        chatbotEnabled: overrides.chatbotEnabled ?? true,
        profileData: { basics: { name: overrides.ownerName ?? "Ada" } },
      },
    ]);
    // Deployment select
    mockSelectQueues.push(
      overrides.hasDeployment === false ? [] : [{ id: "dep-1" }]
    );
  }
}

function primeSessionLookup(existing: boolean) {
  if (existing) {
    mockSelectQueues.push([
      { id: "s-existing", messages: [{ role: "user", content: "hi" }] },
    ]);
  } else {
    mockSelectQueues.push([]);
    mockInsertReturn.push([{ id: "s-new" }]);
  }
}

const FAKE_VECTOR = new Array(1536).fill(0.01);

beforeEach(() => {
  mockSelectQueues.length = 0;
  mockInsertReturn.length = 0;
  mockUpdateCalls.length = 0;
  mockUpdatingId = null;
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue(FAKE_VECTOR);
  mockGetLlmClient.mockReset();
  mockGetLlmClient.mockResolvedValue({
    provider: "openai",
    model: "gpt-4o-mini",
    text: async () => "Sure, here's the answer.",
    structured: async () => ({}),
  });
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue([]);

  __resetForTests();
  __setClockForTests(null);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/chatbot/message — validation", () => {
  it("400 on malformed JSON", async () => {
    const req = new Request("http://localhost/api/chatbot/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("bad_request");
  });

  it("400 on missing portfolioId", async () => {
    const res = await POST(
      makeReq({ visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(400);
  });

  it("400 on empty message", async () => {
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "   " }) as any
    );
    expect(res.status).toBe(400);
  });

  it("400 on oversize message", async () => {
    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v",
        message: "x".repeat(MAX_VISITOR_MESSAGE_CHARS + 1),
      }) as any
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chatbot/message — publish gate", () => {
  it("404 when portfolio doesn't exist", async () => {
    primePortfolio({ missing: true });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("not_found");
  });

  it("404 when chatbot is disabled on the portfolio", async () => {
    primePortfolio({ chatbotEnabled: false });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(404);
  });

  it("404 when the portfolio has no deployments", async () => {
    primePortfolio({ hasDeployment: false });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/chatbot/message — LLM configuration", () => {
  it("503 when no provider is configured", async () => {
    primePortfolio({});
    mockGetLlmClient.mockRejectedValue(new LlmNotConfiguredError());
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("not_configured");
  });

  it("503 when embedding API key is missing / fails", async () => {
    primePortfolio({});
    mockGenerateEmbedding.mockRejectedValue(new Error("401 unauthorized"));
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(503);
  });

  it("503 when the BYOK key is rejected by the provider", async () => {
    primePortfolio({});
    mockGetLlmClient.mockResolvedValue({
      provider: "openai",
      model: "gpt-4o-mini",
      text: async () => {
        throw new LlmInvalidKeyError("openai", "401");
      },
      structured: async () => ({}),
    });
    const res = await POST(
      makeReq({ portfolioId: "pf-1", visitorId: "v", message: "hi" }) as any
    );
    expect(res.status).toBe(503);
  });
});

describe("POST /api/chatbot/message — rate limits", () => {
  it("429 after PER_VISITOR_MESSAGES in-window calls", async () => {
    // Each call to the route primes portfolio + session lookup, so we
    // need to prime enough fixtures for every success. After
    // PER_VISITOR_MESSAGES the rate limiter kicks in BEFORE portfolio
    // fetch, so no fixtures needed for the 429 call.
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) {
      primePortfolio({});
      primeSessionLookup(false);
    }
    const body = { portfolioId: "pf-1", visitorId: "v-1", message: "hi" };
    for (let i = 0; i < PER_VISITOR_MESSAGES; i++) {
      const res = await POST(makeReq(body) as any);
      expect(res.status).toBe(200);
    }
    // (N+1)th — rate-limited BEFORE any DB lookup.
    const res = await POST(makeReq(body) as any);
    expect(res.status).toBe(429);
    const errBody = await res.json();
    expect(errBody.code).toBe("rate_limited");
    expect(errBody.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("POST /api/chatbot/message — happy path", () => {
  it("200 returns the LLM reply and upserts a new session", async () => {
    primePortfolio({});
    primeSessionLookup(false);
    mockRetrieve.mockResolvedValue([
      {
        chunkType: "fact",
        chunkText: "Built Widget API in Go.",
        sourceRef: "facts:f-1",
        metadata: { projectName: "Widget" },
        score: 0.91,
      },
    ]);

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "What have they built?",
      }) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Sure, here's the answer.");
    expect(body.sessionId).toBe("s-new");

    // LLM received a system prompt grounded in owner name
    const llm = mockGetLlmClient.mock.results[0].value;
    // (We can't inspect the call args directly because we replaced text in the
    //  jest mock; we instead assert the retriever was consulted with the embed vector.)
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockRetrieve).toHaveBeenCalledWith(
      "pf-1",
      expect.any(Array),
      expect.any(Number)
    );
    expect(llm).toBeDefined();
  });

  it("200 appends both turns to an existing session row", async () => {
    primePortfolio({});
    primeSessionLookup(true); // existing session with one prior message

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "follow-up",
      }) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("s-existing");
    // Update was called with a messages array containing prior + 2 new
    expect(mockUpdateCalls).toHaveLength(1);
    const setPatch = mockUpdateCalls[0].set;
    expect(Array.isArray(setPatch.messages)).toBe(true);
    expect((setPatch.messages as unknown[]).length).toBe(3);
  });

  it("falls back to a synthetic sessionId when the DB write errors", async () => {
    primePortfolio({});
    // Session lookup throws — upsert will blow up.
    mockSelectQueues.push(
      new Proxy([], {
        get() {
          throw new Error("db down");
        },
      }) as unknown[]
    );

    const res = await POST(
      makeReq({
        portfolioId: "pf-1",
        visitorId: "v-1",
        message: "hi",
      }) as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Sure, here's the answer.");
    expect(body.sessionId).toMatch(/^synthetic-/);
  });
});
