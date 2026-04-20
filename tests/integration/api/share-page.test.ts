/**
 * @jest-environment node
 *
 * Integration tests for the public share-preview route handler.
 *
 * Coverage:
 *   - 404 on malformed token shape (doesn't hit the DB)
 *   - 404 on unknown token
 *   - 404 on expired / revoked tokens
 *   - 200 HTML with the right content-type on index + sub-pages
 *   - 200 text/css for /styles/global.css
 *   - 404 when the requested sub-path isn't in the generator output
 *   - X-Share-Preview header present
 *   - noindex meta injected into HTML
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSelectQueues: unknown[][] = [];
const mockUpdateCalls: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      where: () => self,
      limit: async () => mockSelectQueues.shift() ?? [],
    };
    return self;
  }
  return {
    db: {
      select: jest.fn(() => selectChain()),
      update: jest.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            mockUpdateCalls.push(patch);
          },
        }),
      })),
    },
  };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
    or: jest.fn(() => "or"),
    gt: jest.fn(() => "gt"),
    isNull: jest.fn(() => "isNull"),
    sql: new Proxy(function () {}, {
      get: () => "sql",
      apply: () => "sql",
    }),
  };
});

// Stub the generator so we don't have to build a real portfolio.
const mockAssembleProfileData = jest.fn();
jest.mock("@/lib/generator/profile-data", () => ({
  assembleProfileData: (...a: unknown[]) => mockAssembleProfileData(...a),
}));
const mockRenderTemplate = jest.fn();
jest.mock("@/lib/generator/renderer", () => ({
  renderTemplate: (...a: unknown[]) => mockRenderTemplate(...a),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { GET } from "@/app/share/[token]/[[...path]]/route";

// Generator output fixture: simulated file map.
function fakeFiles(): Map<string, string> {
  return new Map([
    ["index.html", "<!DOCTYPE html><html><head></head><body>home</body></html>"],
    ["about/index.html", "<!DOCTYPE html><html><head></head><body>about</body></html>"],
    ["projects/foo/index.html", "<!DOCTYPE html><html><head></head><body>foo</body></html>"],
    ["styles/global.css", "body { color: red; }"],
  ]);
}

const VALID_TOKEN = "ABCDEFGHJKMNPQRSTVWXYZ23"; // 24 chars, all Crockford
const ACTIVE_ROW = {
  id: "lk-1",
  portfolioId: "pf-1",
  token: VALID_TOKEN,
  revokedAt: null,
  expiresAt: null,
};

beforeEach(() => {
  mockSelectQueues.length = 0;
  mockUpdateCalls.length = 0;
  mockAssembleProfileData.mockReset();
  mockAssembleProfileData.mockResolvedValue({
    meta: { templateId: "minimal" },
    chatbot: undefined,
  });
  mockRenderTemplate.mockReset();
  mockRenderTemplate.mockResolvedValue(fakeFiles());
});

function makeReq() {
  return new Request("http://localhost/share/irrelevant");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /share/[token]/[[...path]]", () => {
  it("404 when token shape is invalid (DB never queried)", async () => {
    const res = await GET(makeReq() as any, {
      params: { token: "not-valid-token" },
    });
    expect(res.status).toBe(404);
    expect(mockSelectQueues.length).toBe(0);
    expect(mockAssembleProfileData).not.toHaveBeenCalled();
  });

  it("404 when token is unknown", async () => {
    mockSelectQueues.push([]); // token lookup — empty
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN },
    });
    expect(res.status).toBe(404);
  });

  it("200 HTML on the index (no sub-path)", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-share-preview")).toBe("1");
    const text = await res.text();
    expect(text).toContain("home");
    // noindex meta injected into <head>
    expect(text).toContain('name="robots"');
    expect(text).toContain("noindex");
  });

  it("200 HTML on a sub-page", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN, path: ["about"] },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("about");
  });

  it("200 HTML for a nested project path", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN, path: ["projects", "foo"] },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("foo");
  });

  it("200 text/css for /styles/global.css", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN, path: ["styles", "global.css"] },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("color: red");
  });

  it("404 when the sub-path isn't in the generator output", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN, path: ["nonexistent"] },
    });
    expect(res.status).toBe(404);
  });

  it("disables the chatbot embed on shared previews", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    mockAssembleProfileData.mockResolvedValue({
      meta: { templateId: "minimal" },
      chatbot: {
        enabled: true,
        apiEndpoint: "https://app/chatbot-embed.js",
        portfolioId: "pf-1",
      },
    });
    await GET(makeReq() as any, { params: { token: VALID_TOKEN } });
    // The ProfileData handed to renderTemplate should have had chatbot wiped.
    const passedProfile = mockRenderTemplate.mock.calls[0][1] as {
      chatbot?: unknown;
    };
    expect(passedProfile.chatbot).toBeUndefined();
  });

  it("sets Cache-Control: private, no-store", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    const res = await GET(makeReq() as any, {
      params: { token: VALID_TOKEN },
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("bumps viewCount + lastViewedAt (fire-and-forget)", async () => {
    mockSelectQueues.push([ACTIVE_ROW]);
    await GET(makeReq() as any, { params: { token: VALID_TOKEN } });
    // The response returns before we await; give the microtask queue one tick.
    await new Promise((r) => setImmediate(r));
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].lastViewedAt).toBeInstanceOf(Date);
  });
});
