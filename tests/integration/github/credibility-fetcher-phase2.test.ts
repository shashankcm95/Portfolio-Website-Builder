/**
 * @jest-environment node
 *
 * Phase 2 integration: CredibilityFetcher produces v2 bundle with
 * `commitActivity`, `commitMessages`, `externalUrl`, and a computed
 * `authorshipSignal` verdict. GitHub network is mocked at the
 * GitHubClient level for all 9 endpoints in the wave.
 */

import { CredibilityFetcher } from "@/lib/github/credibility-fetcher";
import type { DependencyFile, RepoMetadata } from "@/lib/github/repo-fetcher";

type MockMap = Record<string, unknown>;

function makeMockClient(
  responses: MockMap,
  headers: Record<string, string | null> = {}
) {
  return {
    async get<T>(path: string): Promise<T> {
      const r = responses[path];
      if (r === undefined) throw new Error(`GitHub API error 404 for ${path}`);
      return r as T;
    },
    async getWithHeaders<T>(
      path: string
    ): Promise<{ data: T; headers: Headers }> {
      const r = responses[path];
      if (r === undefined) throw new Error(`GitHub API error 404 for ${path}`);
      const h = new Headers();
      const link = headers[path];
      if (link) h.set("link", link);
      return { data: r as T, headers: h };
    },
  } as any;
}

const DAY = 1000 * 60 * 60 * 24;
const now = Date.now();
const isoDaysAgo = (n: number) => new Date(now - n * DAY).toISOString();

const matureMetadata: RepoMetadata = {
  name: "demo",
  fullName: "acme/demo",
  description: null,
  language: "TypeScript",
  stargazersCount: 100,
  forksCount: 10,
  topics: ["portfolio"],
  defaultBranch: "main",
  createdAt: isoDaysAgo(730),
  updatedAt: isoDaysAgo(1),
  license: null,
  htmlUrl: "https://github.com/acme/demo",
  homepage: "https://acme.example.com",
};

const jsDeps: DependencyFile[] = [
  {
    type: "package_json",
    path: "package.json",
    content: JSON.stringify({
      dependencies: { next: "14.0.0" },
      devDependencies: { jest: "29.0.0" },
    }),
  },
];

describe("CredibilityFetcher v2 — authorship verdict", () => {
  it("produces v2 bundle with sustained verdict for a mature collab repo (Case D)", async () => {
    const weeks = Array.from({ length: 52 }, () => ({
      week: 0,
      total: 10,
      days: [1, 1, 1, 1, 1, 0, 0], // 5 active days/week × 52 = 260, well above 20
    }));

    const client = makeMockClient(
      {
        "/repos/acme/demo/actions/runs?per_page=1": {
          workflow_runs: [
            {
              id: 1,
              status: "completed",
              conclusion: "success",
              html_url: "x",
              created_at: isoDaysAgo(1),
            },
          ],
        },
        "/repos/acme/demo/actions/workflows": {
          workflows: [
            {
              id: 1,
              name: "CI",
              path: ".github/workflows/ci.yml",
              state: "active",
            },
          ],
        },
        "/repos/acme/demo/commits?per_page=1": [
          { commit: { committer: { date: isoDaysAgo(1) } } },
        ],
        "/repos/acme/demo/commits?per_page=1&page=500": [
          { commit: { committer: { date: isoDaysAgo(730) } } },
        ],
        "/repos/acme/demo/contributors?per_page=1&anon=1": [{ id: 1 }],
        "/repos/acme/demo/languages": { TypeScript: 10000 },
        "/repos/acme/demo/releases?per_page=1": [
          {
            tag_name: "v2.0",
            name: "v2.0",
            created_at: isoDaysAgo(30),
            published_at: isoDaysAgo(30),
          },
        ],
        "/repos/acme/demo/issues?per_page=1&state=closed": [{}],
        "/repos/acme/demo/stats/commit_activity": weeks,
        "/repos/acme/demo/commits?per_page=30": Array.from(
          { length: 30 },
          (_, i) => ({
            commit: { message: `Add feature number ${i} with details` },
          })
        ),
      },
      {
        "/repos/acme/demo/commits?per_page=1":
          '<https://api.github.com/x?page=500>; rel="last"',
        "/repos/acme/demo/contributors?per_page=1&anon=1":
          '<https://api.github.com/x?page=8>; rel="last"',
        "/repos/acme/demo/releases?per_page=1":
          '<https://api.github.com/x?page=15>; rel="last"',
        "/repos/acme/demo/issues?per_page=1&state=closed":
          '<https://api.github.com/x?page=100>; rel="last"',
      }
    );

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", matureMetadata, jsDeps);

    expect(result.schemaVersion).toBe(2);

    // v2 fields present
    expect(result.commitActivity).toMatchObject({
      status: "ok",
      activeDayCount: 260,
      totalWeeks: 52,
    });
    expect(result.commitMessages).toMatchObject({
      status: "ok",
      total: 30,
    });
    expect(result.externalUrl).toBe("https://acme.example.com");

    // Authorship composed
    expect(result.authorshipSignal.status).toBe("ok");
    if (result.authorshipSignal.status !== "ok") return;
    expect(result.authorshipSignal.verdict).toBe("sustained");
    expect(result.authorshipSignal.positiveCount).toBeGreaterThanOrEqual(5);
    expect(result.authorshipSignal.factors).toHaveLength(6);
  });

  it("produces single-burst verdict for an AI-dump-shape repo (Case A)", async () => {
    const freshMeta: RepoMetadata = {
      ...matureMetadata,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1),
      topics: [],
      homepage: null,
    };

    const client = makeMockClient(
      {
        "/repos/acme/demo/actions/workflows": { workflows: [] },
        "/repos/acme/demo/commits?per_page=1": [
          { commit: { committer: { date: isoDaysAgo(1) } } },
        ],
        "/repos/acme/demo/contributors?per_page=1&anon=1": [{ id: 1 }],
        "/repos/acme/demo/languages": { TypeScript: 1000 },
        "/repos/acme/demo/issues?per_page=1&state=closed": [],
        "/repos/acme/demo/stats/commit_activity": [
          {
            week: 0,
            total: 1,
            days: [1, 0, 0, 0, 0, 0, 0], // 1 active day
          },
        ],
        "/repos/acme/demo/commits?per_page=30": [
          { commit: { message: "initial commit" } },
        ],
      },
      {
        // no Link headers → count = 1 for commits, 1 for contributors, 0 for issues
      }
    );

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", freshMeta, []);

    expect(result.schemaVersion).toBe(2);
    expect(result.externalUrl).toBeNull();
    expect(result.authorshipSignal.status).toBe("ok");
    if (result.authorshipSignal.status !== "ok") return;
    expect(result.authorshipSignal.verdict).toBe("single-burst");
    expect(result.authorshipSignal.positiveCount).toBe(0);
  });

  it("derives externalUrl from deploy-host htmlUrl when homepage is absent", async () => {
    const deployHostedMeta: RepoMetadata = {
      ...matureMetadata,
      homepage: null,
      htmlUrl: "https://user.github.io/my-portfolio",
    };
    // Minimal happy mocks — enough for the fetcher to not blow up
    const client = makeMockClient({
      "/repos/acme/demo/actions/workflows": { workflows: [] },
      "/repos/acme/demo/commits?per_page=1": [
        { commit: { committer: { date: isoDaysAgo(10) } } },
      ],
      "/repos/acme/demo/contributors?per_page=1&anon=1": [{}],
      "/repos/acme/demo/languages": { HTML: 500 },
      "/repos/acme/demo/issues?per_page=1&state=closed": [],
      "/repos/acme/demo/stats/commit_activity": [],
      "/repos/acme/demo/commits?per_page=30": [],
    });

    const fetcher = new CredibilityFetcher(client);
    const result = await fetcher.fetchAll("acme", "demo", deployHostedMeta, []);

    expect(result.externalUrl).toBe("https://user.github.io/my-portfolio");
  });
});
