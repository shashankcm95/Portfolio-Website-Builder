import type { GitHubClient } from "@/lib/github/client";
import type { DependencyFile, RepoMetadata } from "@/lib/github/repo-fetcher";
import { pLimit } from "@/lib/github/concurrency";
import { parseLinkHeaderLast } from "@/lib/github/link-header";
import { classifyWorkflow } from "@/lib/github/workflow-classifier";
import { toLanguageBreakdown } from "@/lib/github/language-percentages";
import {
  detectTestFramework,
  extractVerifiedStack,
} from "@/lib/github/stack-detector";
import { fetchCommitActivity } from "@/lib/github/commit-activity-fetcher";
import { fetchRecentCommitMessages } from "@/lib/github/commit-messages-fetcher";
import {
  resolveExternalUrl,
  scoreAuthorship,
} from "@/lib/credibility/authorship";
import { classifyRepoCategory } from "@/lib/credibility/category";
import {
  CREDIBILITY_SCHEMA_VERSION,
  type CiSignal,
  type CommitActivitySignal,
  type CommitMessagesSignal,
  type CommitsSignal,
  type ContributorsSignal,
  type CredibilitySignals,
  type IssuesAndPRsSignal,
  type LanguageSignal,
  type RecencySignal,
  type RepoCategory,
  type CategorySource,
  type ReleaseSignal,
  type TestFrameworkSignal,
  type TopicsSignal,
  type VerifiedStackSignal,
  type WorkflowCategory,
  type WorkflowSignal,
} from "@/lib/credibility/types";

// ─── Response shapes (minimal — we only decode what we need) ────────────────

interface ActionsRunListResponse {
  workflow_runs: Array<{
    id: number;
    status: string;
    conclusion: string | null;
    html_url: string;
    created_at: string;
  }>;
  total_count: number;
}

interface WorkflowsListResponse {
  workflows: Array<{
    id: number;
    name: string;
    path: string;
    state: string;
  }>;
  total_count: number;
}

interface CommitEntry {
  commit: {
    author?: { date?: string };
    committer?: { date?: string };
  };
}

interface ReleaseEntry {
  tag_name: string;
  name: string | null;
  created_at: string;
  published_at: string | null;
}

// ─── Fetcher ────────────────────────────────────────────────────────────────

const MAX_INFLIGHT = 4;

/**
 * Pulls the Phase-1 credibility signal bundle for a single GitHub repo.
 *
 * Every sub-fetch runs through a `Promise.allSettled` so a single endpoint
 * failure (404 for a repo with no CI, rate-limit hiccup, etc.) never
 * corrupts the overall result. Each signal carries its own `status: "ok"
 * | "missing" | "error"` so the UI can render the right affordance.
 *
 * Concurrency is capped at `MAX_INFLIGHT` in-flight calls per repo — GitHub
 * trips secondary abuse limits on high fan-out even within the 5000/h
 * authenticated bucket.
 */
export class CredibilityFetcher {
  constructor(private readonly client: GitHubClient) {}

  /**
   * Fetch the full signal bundle for `owner/repo`.
   *
   * `metadata` is the already-fetched {@link RepoMetadata} from
   * {@link RepoFetcher} — we piggyback on it for recency (`createdAt`,
   * `pushed_at`-equivalent `updatedAt`) and topics, avoiding extra calls.
   *
   * `dependencies` are the already-parsed dependency files — we derive the
   * test framework and verified stack from them locally.
   */
  /**
   * @param options.userGithubLogin - The portfolio owner's GitHub login.
   *   Used by the Phase 8 classifier to distinguish `oss_author` (your own
   *   repo) from `oss_contributor` (someone else's). When omitted the
   *   classifier returns `unspecified` and the presentation falls back to
   *   the legacy 6-factor rubric.
   * @param options.overrideCategory - If set, skips the classifier and
   *   uses this category verbatim. Used when the owner has manually
   *   overridden the category and a subsequent refresh shouldn't undo
   *   their choice.
   * @param options.overrideCategorySource - Stamp on the presentation
   *   alongside `overrideCategory` (typically `"manual"`).
   *
   * The returned bundle always has its authorship signal classified; the
   * caller reads `bundle.authorshipSignal.presentation.category` to get
   * the classifier result and should persist it to the `projects.project_category`
   * column on first fetch.
   */
  async fetchAll(
    owner: string,
    repo: string,
    metadata: RepoMetadata,
    dependencies: DependencyFile[],
    options?: {
      userGithubLogin?: string | null;
      overrideCategory?: RepoCategory;
      overrideCategorySource?: CategorySource;
    }
  ): Promise<CredibilitySignals> {
    const limit = pLimit(MAX_INFLIGHT);

    const [
      ciSettled,
      workflowsSettled,
      commitsSettled,
      contributorsSettled,
      languagesSettled,
      releasesSettled,
      issuesSettled,
      activitySettled,
      messagesSettled,
    ] = await Promise.allSettled([
      limit(() => this.fetchCi(owner, repo)),
      limit(() => this.fetchWorkflows(owner, repo)),
      limit(() => this.fetchCommits(owner, repo)),
      limit(() => this.fetchContributors(owner, repo)),
      limit(() => this.fetchLanguages(owner, repo)),
      limit(() => this.fetchReleases(owner, repo)),
      limit(() => this.fetchIssuesAndPRs(owner, repo)),
      limit(() => fetchCommitActivity(this.client, owner, repo)),
      limit(() => fetchRecentCommitMessages(this.client, owner, repo)),
    ]);

    const testFramework: TestFrameworkSignal = (() => {
      const name = detectTestFramework(dependencies);
      return name ? { status: "ok", name } : { status: "missing" };
    })();

    const verifiedStack: VerifiedStackSignal = (() => {
      const items = extractVerifiedStack(dependencies);
      return items.length > 0
        ? { status: "ok", items }
        : { status: "missing" };
    })();

    const recency: RecencySignal = metadata.createdAt
      ? {
          status: "ok",
          createdAt: metadata.createdAt,
          lastPushedAt: metadata.updatedAt ?? metadata.createdAt,
        }
      : { status: "error" };

    const topics: TopicsSignal = Array.isArray(metadata.topics)
      ? metadata.topics.length > 0
        ? { status: "ok", items: metadata.topics }
        : { status: "missing" }
      : { status: "missing" };

    // v2: resolve externalUrl from homepage or deploy-host-hosted htmlUrl
    const externalUrl = resolveExternalUrl(
      metadata.homepage ?? null,
      metadata.htmlUrl ?? ""
    );

    // Compose the v2 bundle WITHOUT the authorship signal first, then
    // score it. Scorer is pure, so this is a cheap second pass.
    const partial: Omit<CredibilitySignals, "authorshipSignal"> = {
      schemaVersion: CREDIBILITY_SCHEMA_VERSION,
      ci: unwrap(ciSettled, { status: "error" as const }),
      recency,
      releases: unwrap(releasesSettled, { status: "error" as const }),
      workflows: unwrap(workflowsSettled, { status: "error" as const }),
      languages: unwrap(languagesSettled, { status: "error" as const }),
      topics,
      commits: unwrap(commitsSettled, { status: "error" as const }),
      contributors: unwrap(contributorsSettled, { status: "error" as const }),
      issuesAndPRs: unwrap(issuesSettled, { status: "error" as const }),
      testFramework,
      verifiedStack,
      commitActivity: unwrap<CommitActivitySignal>(activitySettled, {
        status: "error",
      }),
      commitMessages: unwrap<CommitMessagesSignal>(messagesSettled, {
        status: "error",
      }),
      externalUrl,
    };

    // Phase 8 — classify once the signal bundle is assembled. When the
    // caller passes an explicit override (the owner picked manually), we
    // stamp that in; otherwise we auto-classify from signals.
    const autoCategory = classifyRepoCategory(
      partial as CredibilitySignals,
      options?.userGithubLogin ?? null,
      owner,
      metadata.stargazersCount ?? null
    );
    const category = options?.overrideCategory ?? autoCategory;
    const categorySource: CategorySource =
      options?.overrideCategory != null
        ? options.overrideCategorySource ?? "manual"
        : "auto";

    return {
      ...partial,
      authorshipSignal: scoreAuthorship(partial as CredibilitySignals, {
        category,
        categorySource,
        characterization: {
          repoOwner: owner,
          repoName: repo,
          stars: metadata.stargazersCount ?? null,
          totalCommits:
            partial.commits.status === "ok" ? partial.commits.total : null,
        },
      }),
    };
  }

  // ─── Individual signal fetchers ────────────────────────────────────────

  private async fetchCi(owner: string, repo: string): Promise<CiSignal> {
    try {
      const data = await this.client.get<ActionsRunListResponse>(
        `/repos/${owner}/${repo}/actions/runs?per_page=1`
      );
      const run = data.workflow_runs?.[0];
      if (!run) return { status: "missing" };
      // A run with conclusion `null` is still in progress; treat as missing
      // for badge purposes (not "failing").
      if (run.conclusion === "success" || run.conclusion === "failure") {
        return {
          status: "ok",
          conclusion: run.conclusion,
          runUrl: run.html_url,
          runAt: run.created_at,
        };
      }
      return { status: "missing" };
    } catch (e) {
      if (isNotFound(e)) return { status: "missing" };
      return { status: "error" };
    }
  }

  private async fetchWorkflows(
    owner: string,
    repo: string
  ): Promise<WorkflowSignal> {
    try {
      const data = await this.client.get<WorkflowsListResponse>(
        `/repos/${owner}/${repo}/actions/workflows`
      );
      const workflows = data.workflows ?? [];
      if (workflows.length === 0) return { status: "missing" };

      const categories: Record<WorkflowCategory, number> = {
        test: 0,
        deploy: 0,
        lint: 0,
        security: 0,
        release: 0,
        other: 0,
      };
      for (const wf of workflows) {
        if (wf.state !== "active") continue;
        const cat = classifyWorkflow(wf.name, wf.path);
        categories[cat]++;
      }
      const total = Object.values(categories).reduce((s, n) => s + n, 0);
      if (total === 0) return { status: "missing" };

      return { status: "ok", total, categories };
    } catch (e) {
      if (isNotFound(e)) return { status: "missing" };
      return { status: "error" };
    }
  }

  private async fetchCommits(
    owner: string,
    repo: string
  ): Promise<CommitsSignal> {
    try {
      // Latest (first page, 1 entry)
      const latest = await this.client.getWithHeaders<CommitEntry[]>(
        `/repos/${owner}/${repo}/commits?per_page=1`
      );
      const link = latest.headers.get("link");
      const last = parseLinkHeaderLast(link);

      const total = last ?? (latest.data.length === 1 ? 1 : 0);
      if (total === 0) return { status: "error" };

      const lastCommit = latest.data[0];
      const lastAt =
        lastCommit?.commit.committer?.date ??
        lastCommit?.commit.author?.date ??
        null;

      // First commit: fetch page=total (cheap — 1 row) to get earliest
      let firstAt: string | null = null;
      if (total > 1) {
        try {
          const first = await this.client.get<CommitEntry[]>(
            `/repos/${owner}/${repo}/commits?per_page=1&page=${total}`
          );
          firstAt =
            first[0]?.commit.committer?.date ??
            first[0]?.commit.author?.date ??
            null;
        } catch {
          firstAt = null;
        }
      } else {
        firstAt = lastAt;
      }

      if (!lastAt || !firstAt) return { status: "error" };

      return { status: "ok", total, firstAt, lastAt };
    } catch {
      return { status: "error" };
    }
  }

  private async fetchContributors(
    owner: string,
    repo: string
  ): Promise<ContributorsSignal> {
    try {
      const res = await this.client.getWithHeaders<unknown[]>(
        `/repos/${owner}/${repo}/contributors?per_page=1&anon=1`
      );
      const link = res.headers.get("link");
      const last = parseLinkHeaderLast(link);
      const count = last ?? (Array.isArray(res.data) ? res.data.length : 0);
      return { status: "ok", count };
    } catch {
      return { status: "error" };
    }
  }

  private async fetchLanguages(
    owner: string,
    repo: string
  ): Promise<LanguageSignal> {
    try {
      const data = await this.client.get<Record<string, number>>(
        `/repos/${owner}/${repo}/languages`
      );
      return { status: "ok", breakdown: toLanguageBreakdown(data) };
    } catch {
      return { status: "error" };
    }
  }

  private async fetchReleases(
    owner: string,
    repo: string
  ): Promise<ReleaseSignal> {
    try {
      const res = await this.client.getWithHeaders<ReleaseEntry[]>(
        `/repos/${owner}/${repo}/releases?per_page=1`
      );
      const link = res.headers.get("link");
      const last = parseLinkHeaderLast(link);
      const count = last ?? res.data.length;
      if (count === 0) return { status: "missing" };
      const latest = res.data[0];
      return {
        status: "ok",
        count,
        latestTag: latest?.tag_name ?? null,
        latestAt: latest?.published_at ?? latest?.created_at ?? null,
      };
    } catch (e) {
      if (isNotFound(e)) return { status: "missing" };
      return { status: "error" };
    }
  }

  private async fetchIssuesAndPRs(
    owner: string,
    repo: string
  ): Promise<IssuesAndPRsSignal> {
    try {
      // The `issues` endpoint includes PRs inline; `state=closed` counts both
      // closed issues and merged/closed PRs — our "resolved" metric.
      const res = await this.client.getWithHeaders<unknown[]>(
        `/repos/${owner}/${repo}/issues?per_page=1&state=closed`
      );
      const link = res.headers.get("link");
      const last = parseLinkHeaderLast(link);
      const closedTotal = last ?? (Array.isArray(res.data) ? res.data.length : 0);
      return { status: "ok", closedTotal };
    } catch {
      return { status: "error" };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    /GitHub API error 404/i.test(error.message)
  );
}
