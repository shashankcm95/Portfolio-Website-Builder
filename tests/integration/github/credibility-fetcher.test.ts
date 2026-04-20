/**
 * @jest-environment node
 *
 * Integration test for CredibilityFetcher. GitHub network is mocked at the
 * GitHubClient level. Asserts:
 *   - all signals compose into the expected CredibilitySignals shape
 *   - per-signal graceful degradation (404 → missing; throw → error)
 *   - recency/topics/testFramework/verifiedStack derived without API calls
 */

import { CredibilityFetcher } from "@/lib/github/credibility-fetcher";
import type { RepoMetadata, DependencyFile } from "@/lib/github/repo-fetcher";

// Minimal mock of GitHubClient — only the methods used by the fetcher.
type MockMap = Record<string, unknown | (() => Promise<unknown>)>;

function makeMockClient(
  responses: MockMap,
  headers: Record<string, string | null> = {}
) {
  return {
    async get<T>(path: string): Promise<T> {
      const r = responses[path];
      if (r === undefined) {
        throw new Error(`GitHub API error 404 for ${path}`);
      }
      if (typeof r === "function") return (await (r as any)()) as T;
      return r as T;
    },
    async getWithHeaders<T>(
      path: string
    ): Promise<{ data: T; headers: Headers }> {
      const r = responses[path];
      if (r === undefined) {
        throw new Error(`GitHub API error 404 for ${path}`);
      }
      const h = new Headers();
      const linkHeader = headers[path];
      if (linkHeader) h.set("link", linkHeader);
      const data = typeof r === "function" ? await (r as any)() : r;
      return { data: data as T, headers: h };
    },
  } as any;
}

const baseMetadata: RepoMetadata = {
  name: "demo",
  fullName: "acme/demo",
  description: "a demo",
  language: "TypeScript",
  stargazersCount: 42,
  forksCount: 3,
  topics: ["ai", "portfolio"],
  defaultBranch: "main",
  createdAt: "2022-01-01T00:00:00Z",
  updatedAt: "2026-04-10T00:00:00Z",
  license: null,
  htmlUrl: "https://github.com/acme/demo",
};

const jsDeps: DependencyFile[] = [
  {
    type: "package_json",
    path: "package.json",
    content: JSON.stringify({
      dependencies: { next: "14.0.0", "drizzle-orm": "0.38.0" },
      devDependencies: { jest: "29.0.0" },
    }),
  },
];

describe("CredibilityFetcher.fetchAll", () => {
  it("composes all signals with ok statuses when GitHub responds happily", async () => {
    const client = makeMockClient(
      {
        "/repos/acme/demo/actions/runs?per_page=1": {
          workflow_runs: [
            {
              id: 1,
              status: "completed",
              conclusion: "success",
              html_url: "https://github.com/acme/demo/actions/runs/1",
              created_at: "2026-04-15T10:00:00Z",
            },
          ],
          total_count: 1,
        },
        "/repos/acme/demo/actions/workflows": {
          workflows: [
            { id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
            {
              id: 2,
              name: "Deploy",
              path: ".github/workflows/deploy.yml",
              state: "active",
            },
          ],
          total_count: 2,
        },
        "/repos/acme/demo/commits?per_page=1": [
          {
            commit: {
              author: { date: "2026-04-10T12:00:00Z" },
              committer: { date: "2026-04-10T12:00:00Z" },
            },
          },
        ],
        "/repos/acme/demo/commits?per_page=1&page=247": [
          {
            commit: {
              author: { date: "2022-01-01T00:00:00Z" },
              committer: { date: "2022-01-01T00:00:00Z" },
            },
          },
        ],
        "/repos/acme/demo/contributors?per_page=1&anon=1": [{ id: 1 }],
        "/repos/acme/demo/languages": {
          TypeScript: 9000,
          JavaScript: 800,
          CSS: 200,
        },
        "/repos/acme/demo/releases?per_page=1": [
          {
            tag_name: "v1.2.0",
            name: "v1.2.0",
            created_at: "2026-03-01T00:00:00Z",
            published_at: "2026-03-01T00:00:00Z",
          },
        ],
        "/repos/acme/demo/issues?per_page=1&state=closed": [{ id: 1 }],
      },
      {
        "/repos/acme/demo/commits?per_page=1":
          '<https://api.github.com/repos/acme/demo/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repos/acme/demo/commits?per_page=1&page=247>; rel="last"',
        "/repos/acme/demo/contributors?per_page=1&anon=1":
          '<https://api.github.com/repos/acme/demo/contributors?per_page=1&page=5>; rel="last"',
        "/repos/acme/demo/releases?per_page=1":
          '<https://api.github.com/repos/acme/demo/releases?per_page=1&page=12>; rel="last"',
        "/repos/acme/demo/issues?per_page=1&state=closed":
          '<https://api.github.com/repos/acme/demo/issues?per_page=1&state=closed&page=47>; rel="last"',
      }
    );

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", baseMetadata, jsDeps);

    expect(result.schemaVersion).toBe(2);

    // CI
    expect(result.ci).toMatchObject({ status: "ok", conclusion: "success" });

    // Recency derived from metadata
    expect(result.recency).toEqual({
      status: "ok",
      createdAt: "2022-01-01T00:00:00Z",
      lastPushedAt: "2026-04-10T00:00:00Z",
    });

    // Releases
    expect(result.releases).toMatchObject({
      status: "ok",
      count: 12,
      latestTag: "v1.2.0",
    });

    // Workflows categorized
    expect(result.workflows).toMatchObject({
      status: "ok",
      total: 2,
      categories: expect.objectContaining({ test: 1, deploy: 1 }),
    });

    // Languages with percentages summing to 100
    expect(result.languages.status).toBe("ok");
    if (result.languages.status === "ok") {
      const total = result.languages.breakdown.reduce((s, e) => s + e.pct, 0);
      expect(total).toBe(100);
      expect(result.languages.breakdown[0].name).toBe("TypeScript");
    }

    // Topics
    expect(result.topics).toEqual({
      status: "ok",
      items: ["ai", "portfolio"],
    });

    // Commits count from Link header
    expect(result.commits).toMatchObject({ status: "ok", total: 247 });

    // Contributors count from Link header
    expect(result.contributors).toEqual({ status: "ok", count: 5 });

    // Issues & PRs from Link header
    expect(result.issuesAndPRs).toEqual({ status: "ok", closedTotal: 47 });

    // Derived from deps (no API call)
    expect(result.testFramework).toEqual({ status: "ok", name: "jest" });
    expect(result.verifiedStack.status).toBe("ok");
    if (result.verifiedStack.status === "ok") {
      expect(result.verifiedStack.items).toEqual(
        expect.arrayContaining(["Next.js", "Drizzle ORM"])
      );
    }
  });

  it("marks CI as missing when /actions/runs returns 404", async () => {
    const client = makeMockClient({
      // No /actions/runs entry — mock throws 404
      "/repos/acme/demo/actions/workflows": { workflows: [], total_count: 0 },
      "/repos/acme/demo/commits?per_page=1": [
        { commit: { committer: { date: "2026-01-01T00:00:00Z" } } },
      ],
      "/repos/acme/demo/contributors?per_page=1&anon=1": [{}],
      "/repos/acme/demo/languages": { Python: 100 },
      // releases missing → 404 → missing
      "/repos/acme/demo/issues?per_page=1&state=closed": [],
    });

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", baseMetadata, []);

    expect(result.ci).toEqual({ status: "missing" });
    expect(result.workflows).toEqual({ status: "missing" });
    expect(result.releases).toEqual({ status: "missing" });
  });

  it("returns status=error when a signal fetcher throws unexpectedly", async () => {
    const client = {
      async get() {
        throw new Error("network unreachable");
      },
      async getWithHeaders() {
        throw new Error("network unreachable");
      },
    } as any;

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", baseMetadata, jsDeps);

    expect(result.ci).toEqual({ status: "error" });
    expect(result.workflows).toEqual({ status: "error" });
    expect(result.commits).toEqual({ status: "error" });
    expect(result.contributors).toEqual({ status: "error" });
    expect(result.languages).toEqual({ status: "error" });
    expect(result.releases).toEqual({ status: "error" });
    expect(result.issuesAndPRs).toEqual({ status: "error" });

    // These don't depend on network:
    expect(result.testFramework).toEqual({ status: "ok", name: "jest" });
    expect(result.recency.status).toBe("ok");
    expect(result.topics.status).toBe("ok");
  });

  it("marks topics missing when metadata has empty topics array", async () => {
    const meta = { ...baseMetadata, topics: [] };
    const client = makeMockClient({
      "/repos/acme/demo/actions/runs?per_page=1": { workflow_runs: [] },
      "/repos/acme/demo/actions/workflows": { workflows: [] },
      "/repos/acme/demo/commits?per_page=1": [
        { commit: { committer: { date: "2026-01-01T00:00:00Z" } } },
      ],
      "/repos/acme/demo/contributors?per_page=1&anon=1": [{}],
      "/repos/acme/demo/languages": { Rust: 1000 },
      "/repos/acme/demo/issues?per_page=1&state=closed": [],
    });

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", meta, []);

    expect(result.topics).toEqual({ status: "missing" });
  });
});
