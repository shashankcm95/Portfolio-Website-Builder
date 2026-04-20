/**
 * @jest-environment node
 *
 * Integration test for the `runStoryboardGenerate` step. The LLM and
 * Drizzle are both mocked — this asserts the step:
 *   - loads context pack + file tree + credibility signals from DB
 *   - calls the LLM with the right prompt shape
 *   - validates the LLM's payload (Zod)
 *   - runs the verifier against each claim (stamps status)
 *   - upserts the resulting payload into generatedSections
 *   - returns non-fatal failures rather than throwing
 */

// ─── jest.mock's factories are hoisted; every referenced var must start ────
// ─── with "mock" so Jest allows the closure. ──────────────────────────────

// Mock the LlmClient's `structured` method — the storyboard step calls it
// directly now (Phase 3.5+). Tests pass this as the optional `llmClient`
// arg to `runStoryboardGenerate` so we don't have to stub the factory.
const mockCallClaudeStructured = jest.fn();

const mockLlmClient = {
  provider: "openai" as const,
  model: "gpt-4o-mini",
  structured: (args: unknown) => mockCallClaudeStructured(args),
  text: async () => "",
};

// Drizzle mock — queries are discriminated by whether the chain ends in
// `.limit()` (projects fetch, single row) or is awaited directly via
// `then` (repoSources fetch, multi-row). We keep two separate queues so
// concurrent `Promise.all` dispatch doesn't race over a single queue.
const mockProjectsSteps: unknown[][] = [];
const mockSourcesSteps: unknown[][] = [];
const mockInsertCalls: Array<{ rows: unknown; onConflict?: unknown }> = [];

jest.mock("@/lib/db", () => {
  function buildChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      limit: async () => {
        const value = mockProjectsSteps.shift();
        if (!value) throw new Error("No projects step queued");
        return value;
      },
      then: (onFulfilled: (v: unknown) => unknown) => {
        const value = mockSourcesSteps.shift();
        if (!value) throw new Error("No sources step queued");
        return Promise.resolve(onFulfilled(value));
      },
    };
    return chain;
  }
  const db = {
    select: jest.fn(() => buildChain()),
    insert: jest.fn(() => ({
      values: (rows: unknown) => ({
        onConflictDoUpdate: (onConflict: unknown) => {
          mockInsertCalls.push({ rows, onConflict });
          return Promise.resolve();
        },
      }),
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

// ─── Route under test ───────────────────────────────────────────────────────
import { runStoryboardGenerate } from "@/lib/pipeline/steps/storyboard-generate";

function happyPayload() {
  return {
    schemaVersion: 1,
    mermaid: "graph TD\n  A --> B",
    cards: [
      {
        id: "what",
        icon: "Lightbulb",
        title: "What is it",
        description: "A portfolio builder.",
        claims: [
          {
            label: "Uses Next.js",
            verifier: { kind: "dep", package: "next" },
          },
        ],
      },
      {
        id: "how",
        icon: "Network",
        title: "How it works",
        description: "SSR with a Postgres backend.",
        claims: [
          {
            label: "Uses Drizzle ORM",
            verifier: { kind: "dep", package: "drizzle-orm" },
          },
        ],
      },
      {
        id: "interesting_file",
        icon: "FileCode",
        title: "Interesting file",
        description: "Orchestrator runs the pipeline.",
        claims: [
          {
            label: "Has orchestrator",
            verifier: { kind: "file", glob: "src/lib/pipeline/orchestrator.ts" },
          },
        ],
      },
      {
        id: "tested",
        icon: "FlaskConical",
        title: "Tested with Jest",
        description: "Unit + integration suites.",
        claims: [
          {
            label: "Uses Jest",
            verifier: { kind: "dep", package: "jest" },
          },
        ],
      },
      {
        id: "deploys",
        icon: "Rocket",
        title: "Deploys via GitHub Actions",
        description: "CI runs deploy.yml.",
        claims: [
          {
            label: "Has deploy workflow",
            verifier: { kind: "workflow", category: "deploy" },
          },
        ],
      },
      {
        id: "try_it",
        icon: "ExternalLink",
        title: "Try it",
        description: "Live at example.com.",
        claims: [],
        extra: {
          kind: "demo",
          url: "https://example.com",
        },
      },
    ],
  };
}

function projectFixture() {
  return {
    id: "p1",
    repoName: "demo",
    displayName: "Demo",
    repoUrl: "https://github.com/acme/demo",
    repoMetadata: {
      homepage: "https://example.com",
      htmlUrl: "https://github.com/acme/demo",
    },
    credibilitySignals: {
      schemaVersion: 2,
      workflows: { status: "ok", total: 2, categories: { test: 1, deploy: 1, lint: 0, security: 0, release: 0, other: 0 } },
      testFramework: { status: "ok", name: "jest" },
    },
  };
}

function repoSourcesFixture() {
  return [
    {
      sourceType: "context_pack",
      content: JSON.stringify({
        techStack: { languages: [], frameworks: [], libraries: [], tools: [] },
        architecture: { type: "monolith", pattern: "MVC", signals: [] },
        complexity: { fileCount: 100, languages: {} },
        keyFeatures: [],
      }),
    },
    { sourceType: "readme", content: "# Demo\n\nPortfolio builder." },
    {
      sourceType: "file_tree",
      content: JSON.stringify([
        { path: "package.json" },
        { path: "src/lib/pipeline/orchestrator.ts" },
        { path: ".github/workflows/deploy.yml" },
      ]),
    },
    {
      sourceType: "package_json",
      content: JSON.stringify({
        dependencies: { next: "14", "drizzle-orm": "0.38" },
        devDependencies: { jest: "29" },
      }),
    },
  ];
}

beforeEach(() => {
  mockProjectsSteps.length = 0;
  mockSourcesSteps.length = 0;
  mockInsertCalls.length = 0;
  mockCallClaudeStructured.mockReset();
});

describe("runStoryboardGenerate", () => {
  it("produces a valid payload and upserts it to the DB (happy path)", async () => {
    mockCallClaudeStructured.mockResolvedValue(happyPayload());
    // runStoryboardGenerate loads: [projects.limit, repoSources (then)],
    // then buildVerifierContext loads: [repoSources (then), projects.limit].
    mockProjectsSteps.push([projectFixture()], [projectFixture()]);
    mockSourcesSteps.push(repoSourcesFixture(), repoSourcesFixture());

    const result = await runStoryboardGenerate("p1", mockLlmClient as any);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Payload matches LLM output shape
    expect(result.payload.schemaVersion).toBe(1);
    expect(result.payload.cards).toHaveLength(6);

    // Verifier stamped statuses (deps next/drizzle-orm/jest all in package.json)
    const whatCard = result.payload.cards[0];
    expect(whatCard.claims[0].status).toBe("verified");
    expect(whatCard.claims[0].evidence).toMatch(/next/);

    // Insert was called with storyboard sectionType
    expect(mockInsertCalls).toHaveLength(1);
    const values = mockInsertCalls[0].rows as Record<string, unknown>;
    expect(values.sectionType).toBe("storyboard");
    expect(values.variant).toBe("default");
    expect(typeof values.content).toBe("string");
  });

  it("flags claims whose verifier has no matching evidence", async () => {
    const payload = happyPayload();
    payload.cards[0].claims = [
      {
        label: "Uses tensorflow",
        verifier: { kind: "dep", package: "tensorflow" },
      },
    ];
    mockCallClaudeStructured.mockResolvedValue(payload);
    mockProjectsSteps.push([projectFixture()], [projectFixture()]);
    mockSourcesSteps.push(repoSourcesFixture(), repoSourcesFixture());

    const result = await runStoryboardGenerate("p1", mockLlmClient as any);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.cards[0].claims[0].status).toBe("flagged");
  });

  it("returns ok:false when the LLM throws (non-fatal)", async () => {
    mockCallClaudeStructured.mockRejectedValue(new Error("rate limited"));
    mockProjectsSteps.push([projectFixture()], [projectFixture()]);
    mockSourcesSteps.push(repoSourcesFixture(), repoSourcesFixture());

    const result = await runStoryboardGenerate("p1", mockLlmClient as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/rate limited/);
    expect(mockInsertCalls).toHaveLength(0); // no row written
  });

  it("returns ok:false when the LLM returns malformed payload", async () => {
    mockCallClaudeStructured.mockResolvedValue({
      schemaVersion: 1,
      mermaid: "graph",
      cards: [], // too few
    });
    mockProjectsSteps.push([projectFixture()], [projectFixture()]);
    mockSourcesSteps.push(repoSourcesFixture(), repoSourcesFixture());

    const result = await runStoryboardGenerate("p1", mockLlmClient as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/malformed/i);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("returns ok:false when the context pack is missing", async () => {
    mockProjectsSteps.push([projectFixture()]);
    mockSourcesSteps.push([{ sourceType: "readme", content: "# demo" }]);
    const result = await runStoryboardGenerate("p1", mockLlmClient as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/context pack/i);
  });

  it("returns ok:false when project does not exist", async () => {
    mockProjectsSteps.push([]);
    mockSourcesSteps.push([]);
    const result = await runStoryboardGenerate("nope", mockLlmClient as any);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);
  });
});
