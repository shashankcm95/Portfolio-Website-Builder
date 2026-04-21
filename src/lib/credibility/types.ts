/**
 * Credibility Signals — typed shape of the `projects.credibility_signals` jsonb
 * column. Each signal is a discriminated union on `status` so the UI can
 * distinguish "the repo has no CI configured" (missing) from "we couldn't
 * fetch it" (error). Failures never throw out of the fetcher.
 *
 * `schemaVersion` lets readers detect out-of-date snapshots and trigger a
 * re-fetch without a DB migration when we add/rename signals.
 */

export const CREDIBILITY_SCHEMA_VERSION = 2 as const;

// ─── Individual signal types ────────────────────────────────────────────────

export type CiSignal =
  | {
      status: "ok";
      conclusion: "success" | "failure";
      runUrl: string;
      runAt: string; // ISO timestamp
    }
  | { status: "missing" }
  | { status: "error" };

export type RecencySignal =
  | {
      status: "ok";
      createdAt: string; // ISO
      lastPushedAt: string; // ISO
    }
  | { status: "error" };

export type ReleaseSignal =
  | {
      status: "ok";
      count: number;
      latestTag: string | null;
      latestAt: string | null; // ISO
    }
  | { status: "missing" }
  | { status: "error" };

export type WorkflowCategory =
  | "test"
  | "deploy"
  | "lint"
  | "security"
  | "release"
  | "other";

export type WorkflowSignal =
  | {
      status: "ok";
      total: number;
      categories: Record<WorkflowCategory, number>;
    }
  | { status: "missing" }
  | { status: "error" };

export type LanguageSignal =
  | {
      status: "ok";
      breakdown: Array<{ name: string; bytes: number; pct: number }>;
    }
  | { status: "error" };

export type TopicsSignal =
  | { status: "ok"; items: string[] }
  | { status: "missing" };

export type CommitsSignal =
  | {
      status: "ok";
      total: number;
      firstAt: string; // ISO
      lastAt: string; // ISO
    }
  | { status: "error" };

export type ContributorsSignal =
  | { status: "ok"; count: number }
  | { status: "error" };

export type IssuesAndPRsSignal =
  | { status: "ok"; closedTotal: number }
  | { status: "error" };

export type TestFrameworkName =
  | "jest"
  | "vitest"
  | "pytest"
  | "cargo-test"
  | "go-test"
  | "mocha";

export type TestFrameworkSignal =
  | { status: "ok"; name: TestFrameworkName }
  | { status: "missing" };

export type VerifiedStackSignal =
  | { status: "ok"; items: string[] }
  | { status: "missing" };

// ─── v2 — Authorship inputs and verdict ─────────────────────────────────────

/**
 * Weekly commit activity from `/repos/{owner}/{repo}/stats/commit_activity`.
 * `activeDayCount` is the distinct count of calendar days with ≥1 commit
 * over the trailing 52 weeks. GitHub's stats endpoints return 202 ("stats
 * computing") on cold repos and 204 for empty repos — both are mapped to
 * `status: "missing"` so the factor scorer can treat them consistently.
 */
export type CommitActivitySignal =
  | { status: "ok"; activeDayCount: number; totalWeeks: number }
  | { status: "missing" }
  | { status: "error" };

/**
 * Recent commit-message sample for quality scoring. `meaningfulCount` is
 * the subset of the `sample` that passes `classifyCommitMessage`.
 */
export type CommitMessagesSignal =
  | {
      status: "ok";
      total: number;
      meaningfulCount: number;
      sample: string[];
    }
  | { status: "error" };

export type AuthorshipVerdict = "sustained" | "mixed" | "single-burst";

export type AuthorshipFactorName =
  | "commitDays"
  | "messageQuality"
  | "collaboration"
  | "releases"
  | "externalPresence"
  | "ageVsPush";

export interface AuthorshipFactor {
  name: AuthorshipFactorName;
  verdict: "positive" | "neutral" | "negative";
  /** User-visible explanation, ≤ 80 chars. */
  reason: string;
}

export type AuthorshipSignal =
  | {
      status: "ok";
      /**
       * @deprecated Phase 8 — retained for one phase so legacy callers don't
       * crash. New UI reads `presentation` instead. Remove in Phase 8.1.
       */
      verdict: AuthorshipVerdict;
      /** @deprecated See `verdict`. */
      positiveCount: number;
      factors: AuthorshipFactor[];
      /**
       * Phase 8 — category-aware, coaching-oriented view of the same data.
       * Optional so pre-Phase-8 rows read from the DB don't break reader code;
       * any freshly-scored signal will have it populated.
       */
      presentation?: AuthorshipPresentation;
    }
  | { status: "missing"; reason: string };

// ─── Phase 8 — Repo categories + coaching presentation ──────────────────────

/**
 * What kind of repo this is, which determines:
 *   - which factors are surfaced (per-category rubric in rubrics.ts)
 *   - the shape of the one-line characterization on the portfolio
 *   - which strengthening suggestions are relevant
 *
 * `unspecified` is the bootstrap default for rows that predate the classifier
 * or where signals were too thin to classify; treated like "no opinion."
 */
export type RepoCategory =
  | "personal_learning"
  | "personal_tool"
  | "oss_author"
  | "oss_contributor"
  | "unspecified";

export const REPO_CATEGORIES: readonly RepoCategory[] = [
  "personal_learning",
  "personal_tool",
  "oss_author",
  "oss_contributor",
  "unspecified",
] as const;

export function isRepoCategory(value: unknown): value is RepoCategory {
  return (
    typeof value === "string" &&
    (REPO_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * How the category was set. `auto` = classifier picked it; the fetcher may
 * re-run the classifier on the next credibility fetch. `manual` = the owner
 * overrode it via the coaching PATCH endpoint; sticks until changed.
 */
export type CategorySource = "auto" | "manual";

/**
 * Phase 8 output shape — the category-aware view that replaces the old
 * `verdict` + `positiveCount` grading. `affirmations` and `gaps` both draw
 * from the same per-factor scorers; a factor lands in one bucket or the
 * other based on its `verdict` (`positive` → affirmations; anything else →
 * gaps). Factors that aren't relevant for the category are omitted from
 * both arrays — they don't count *for* or *against* the repo.
 */
export interface AuthorshipPresentation {
  category: RepoCategory;
  categorySource: CategorySource;
  /** Factors with `verdict === "positive"` within the category's rubric. */
  affirmations: AuthorshipFactor[];
  /** Factors with `verdict !== "positive"` within the category's rubric. */
  gaps: AuthorshipFactor[];
  /**
   * One-line, deterministic description baked into the portfolio when the
   * owner opts in. Never contains a score, never contains a verdict word.
   */
  characterization: string;
}

// ─── Bundle ─────────────────────────────────────────────────────────────────

export interface CredibilitySignals {
  schemaVersion: typeof CREDIBILITY_SCHEMA_VERSION;

  // "Is this real and maintained?"
  ci: CiSignal;
  recency: RecencySignal;
  releases: ReleaseSignal;

  // "What does it do and how?"
  workflows: WorkflowSignal;
  languages: LanguageSignal;
  topics: TopicsSignal;

  // "Does the developer work like a pro?"
  commits: CommitsSignal;
  contributors: ContributorsSignal;
  issuesAndPRs: IssuesAndPRsSignal;

  // "What do they use?"
  testFramework: TestFrameworkSignal;
  verifiedStack: VerifiedStackSignal;

  // v2 additions — authorship inputs and composed verdict
  commitActivity: CommitActivitySignal;
  commitMessages: CommitMessagesSignal;
  /**
   * Non-null when the repo declares a `homepage` URL, or its `html_url` is
   * hosted on a known deploy platform (vercel.app, netlify.app, pages.dev,
   * github.io, fly.dev). Used as a boolean signal in the scorer — we do
   * NOT render the URL itself here.
   */
  externalUrl: string | null;
  authorshipSignal: AuthorshipSignal;
}

/**
 * Reader-side type for DB rows that may have been written under earlier
 * schema versions. v2-only fields are optional so pre-upgrade rows round
 * trip without crashing the UI; components guard for `undefined`.
 */
export type StoredCredibilitySignals = Omit<
  CredibilitySignals,
  | "schemaVersion"
  | "commitActivity"
  | "commitMessages"
  | "externalUrl"
  | "authorshipSignal"
> & {
  schemaVersion: number;
} & Partial<
    Pick<
      CredibilitySignals,
      "commitActivity" | "commitMessages" | "externalUrl" | "authorshipSignal"
    >
  >;
