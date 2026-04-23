/**
 * Authorship scorer — the Phase 2 anti-slop verdict.
 *
 * Takes a {@link CredibilitySignals} bundle and returns an
 * {@link AuthorshipSignal} classifying the repo as sustained / mixed /
 * single-burst. The scorer is a pure function: same input → same output,
 * no I/O, no dates beyond what's already stamped into the signals.
 *
 * **Important**: no single factor decides the verdict. We need ≥3
 * *independent* positive factors to award "sustained." This is what
 * rescues a legitimate 1-commit launch repo that has real releases +
 * homepage from being flagged as single-burst.
 *
 * All thresholds live in exported constants so tests can import them and
 * the rulebook is auditable in one place.
 */

import type {
  AuthorshipFactor,
  AuthorshipPresentation,
  AuthorshipSignal,
  AuthorshipVerdict,
  CategorySource,
  CredibilitySignals,
  RepoCategory,
} from "@/lib/credibility/types";
import { scoreWithRubric } from "@/lib/credibility/rubrics";
import { generateCharacterization } from "@/lib/credibility/characterization";

// ─── Exported thresholds ────────────────────────────────────────────────────

export const THRESHOLDS = {
  // commitDays
  COMMIT_DAYS_POSITIVE: 20,
  COMMIT_DAYS_NEUTRAL_MIN: 5,
  // messageQuality
  MSG_QUALITY_POSITIVE_RATIO: 0.5,
  MSG_QUALITY_NEUTRAL_RATIO: 0.25,
  MSG_QUALITY_MIN_TOTAL_FOR_POSITIVE: 5,
  // ageVsPush
  AGE_MIN_DAYS_FOR_POSITIVE: 14,
  PUSH_MAX_DAYS_FOR_POSITIVE: 180,
  // meaningful message
  MEANINGFUL_MIN_LENGTH: 21, // strictly > 20
} as const;

/**
 * Common low-signal commit messages that should NOT count as "meaningful"
 * even if they happen to scrape the length bar. Frozen for stability —
 * changes here affect every repo's score.
 */
export const STOP_LIST: ReadonlySet<string> = new Set([
  "fix",
  "fixes",
  "fixed",
  "wip",
  "update",
  "updates",
  "updated",
  "initial commit",
  "first commit",
  ".",
  "...",
  "commit",
  "changes",
  "test",
  "tests",
  "misc",
  "cleanup",
  "tweak",
  "tweaks",
  "minor",
  "minor fix",
  "small fix",
  "bugfix",
  "patch",
]);

const DEPLOY_HOST_SUFFIXES = [
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "github.io",
  "fly.dev",
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify a single commit message as "meaningful."
 *
 * 1. Trim + take first line only.
 * 2. Reject messages ≤ 20 chars.
 * 3. Reject if the lowercased full message is in `STOP_LIST`.
 * 4. Reject if the first token is not alphabetic (bare version tags like
 *    `v1.0.0` without context fail here).
 * 5. Otherwise accept. Conventional Commits (`feat: ...`, `fix(scope): ...`)
 *    pass via length + first-token rules.
 */
export function classifyCommitMessage(message: string): boolean {
  const firstLine = message.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length < THRESHOLDS.MEANINGFUL_MIN_LENGTH) return false;

  const lowered = firstLine.toLowerCase();
  if (STOP_LIST.has(lowered)) return false;

  // First token check: get the part before the first non-identifier char,
  // i.e. `feat(auth)` → `feat`, `Add middleware` → `Add`, `v1.0.0` → `v`
  // (which is alphabetic but short — however, bare version tags tend to
  // be trimmed by length already; we still reject if the message starts
  // with a digit).
  const firstChar = firstLine[0];
  if (!firstChar || !/[a-zA-Z]/.test(firstChar)) return false;

  return true;
}

/**
 * Compute the authorship signal from the credibility bundle.
 *
 * Returns `status: "missing"` when all three commit-related signals
 * (`commits`, `commitActivity`, `commitMessages`) failed to fetch — we
 * genuinely couldn't see, so refusing to score is more honest than
 * returning red by default.
 *
 * Phase 8 — the signal now carries a `presentation` with a category-aware
 * view (affirmations + gaps + one-line characterization). The legacy
 * `verdict` + `positiveCount` fields remain populated for one deprecation
 * phase so existing callers don't break; new UI reads `presentation`.
 *
 * `category` defaults to `unspecified` when the caller doesn't know yet —
 * the classifier in `credibility-fetcher.ts` passes the real category once
 * it's computed. `unspecified` falls back to the full 6-factor rubric, so
 * the legacy shape is unchanged when category info isn't supplied.
 */
export function scoreAuthorship(
  signals: CredibilitySignals,
  options?: {
    category?: RepoCategory;
    categorySource?: CategorySource;
    /** Fields needed by the characterization generator (portfolio byline). */
    characterization?: {
      repoOwner?: string | null;
      repoName?: string | null;
      stars?: number | null;
      totalCommits?: number | null;
    };
  }
): AuthorshipSignal {
  if (
    signals.commits.status !== "ok" &&
    signals.commitActivity.status !== "ok" &&
    signals.commitMessages.status !== "ok"
  ) {
    return {
      status: "missing",
      reason: "Could not fetch commit data — try refreshing.",
    };
  }

  // Legacy 6-factor view — retained for the deprecation window. The shape
  // is unchanged from pre-Phase-8 so any reader of `factors` / `verdict`
  // keeps working.
  const factors: AuthorshipFactor[] = [
    scoreCommitDays(signals),
    scoreMessageQuality(signals),
    scoreCollaboration(signals),
    scoreReleases(signals),
    scoreExternalPresence(signals),
    scoreAgeVsPush(signals),
  ];

  const positiveCount = factors.filter((f) => f.verdict === "positive").length;
  const verdict: AuthorshipVerdict =
    positiveCount >= 3 ? "sustained" : positiveCount >= 1 ? "mixed" : "single-burst";

  // Phase 8 — category-aware presentation. If the caller didn't pass a
  // category, default to `unspecified` which reuses the full rubric.
  const category: RepoCategory = options?.category ?? "unspecified";
  const categorySource: CategorySource = options?.categorySource ?? "auto";
  const { affirmations, gaps } = scoreWithRubric(signals, category);
  const characterization = generateCharacterization({
    category,
    signals,
    repoOwner: options?.characterization?.repoOwner ?? null,
    repoName: options?.characterization?.repoName ?? null,
    stars: options?.characterization?.stars ?? null,
    totalCommits: options?.characterization?.totalCommits ?? null,
  });

  const presentation: AuthorshipPresentation = {
    category,
    categorySource,
    affirmations,
    gaps,
    characterization,
  };

  return { status: "ok", verdict, positiveCount, factors, presentation };
}

// ─── Per-factor sub-scorers ─────────────────────────────────────────────────

export function scoreCommitDays(s: CredibilitySignals): AuthorshipFactor {
  const ca = s.commitActivity;
  if (ca.status !== "ok") {
    return {
      name: "commitDays",
      verdict: "negative",
      reason: "No commit-activity data available.",
    };
  }
  const n = ca.activeDayCount;
  if (n >= THRESHOLDS.COMMIT_DAYS_POSITIVE) {
    return {
      name: "commitDays",
      verdict: "positive",
      reason: `Active on ${n} distinct days in the past year.`,
    };
  }
  if (n >= THRESHOLDS.COMMIT_DAYS_NEUTRAL_MIN) {
    return {
      name: "commitDays",
      verdict: "neutral",
      reason: `Active on ${n} days — healthy but not sustained.`,
    };
  }
  return {
    name: "commitDays",
    verdict: "negative",
    reason: `Only ${n} active day${n === 1 ? "" : "s"} in the past year.`,
  };
}

export function scoreMessageQuality(s: CredibilitySignals): AuthorshipFactor {
  const m = s.commitMessages;
  if (m.status !== "ok" || m.total === 0) {
    return {
      name: "messageQuality",
      verdict: "negative",
      reason: "No commit-message data available.",
    };
  }
  const ratio = m.meaningfulCount / m.total;
  if (
    ratio >= THRESHOLDS.MSG_QUALITY_POSITIVE_RATIO &&
    m.total >= THRESHOLDS.MSG_QUALITY_MIN_TOTAL_FOR_POSITIVE
  ) {
    return {
      name: "messageQuality",
      verdict: "positive",
      reason: `${Math.round(ratio * 100)}% of recent commits have descriptive messages.`,
    };
  }
  if (
    ratio >= THRESHOLDS.MSG_QUALITY_NEUTRAL_RATIO ||
    (m.total < THRESHOLDS.MSG_QUALITY_MIN_TOTAL_FOR_POSITIVE &&
      m.meaningfulCount >= 1)
  ) {
    return {
      name: "messageQuality",
      verdict: "neutral",
      reason: `Some commit messages are descriptive (${m.meaningfulCount}/${m.total}).`,
    };
  }
  return {
    name: "messageQuality",
    verdict: "negative",
    reason: `Most commit messages are short or generic (${m.meaningfulCount}/${m.total}).`,
  };
}

export function scoreCollaboration(s: CredibilitySignals): AuthorshipFactor {
  const closedPRs =
    s.issuesAndPRs.status === "ok" ? s.issuesAndPRs.closedTotal : 0;
  const contributors =
    s.contributors.status === "ok" ? s.contributors.count : 0;

  if (closedPRs >= 1) {
    return {
      name: "collaboration",
      verdict: "positive",
      reason: `${closedPRs} closed issue${closedPRs === 1 ? "" : "s"} / PR${closedPRs === 1 ? "" : "s"}.`,
    };
  }
  if (contributors >= 2) {
    return {
      name: "collaboration",
      verdict: "positive",
      reason: `${contributors} contributors — collaborative project.`,
    };
  }
  return {
    name: "collaboration",
    verdict: "negative",
    reason: "No merged PRs and solo authorship.",
  };
}

export function scoreReleases(s: CredibilitySignals): AuthorshipFactor {
  if (s.releases.status === "ok" && s.releases.count >= 1) {
    return {
      name: "releases",
      verdict: "positive",
      reason: `${s.releases.count} tagged release${s.releases.count === 1 ? "" : "s"}.`,
    };
  }
  return {
    name: "releases",
    verdict: "negative",
    reason: "No tagged releases.",
  };
}

export function scoreExternalPresence(s: CredibilitySignals): AuthorshipFactor {
  if (s.externalUrl) {
    return {
      name: "externalPresence",
      verdict: "positive",
      reason: "Declares a homepage / live deploy URL.",
    };
  }
  return {
    name: "externalPresence",
    verdict: "negative",
    reason: "No homepage URL in repo metadata.",
  };
}

export function scoreAgeVsPush(s: CredibilitySignals): AuthorshipFactor {
  if (s.recency.status !== "ok") {
    return {
      name: "ageVsPush",
      verdict: "negative",
      reason: "No recency data.",
    };
  }
  const now = Date.now();
  const ageDays = Math.floor(
    (now - new Date(s.recency.createdAt).getTime()) / DAY
  );
  const pushDays = Math.floor(
    (now - new Date(s.recency.lastPushedAt).getTime()) / DAY
  );

  const activePushed = pushDays <= THRESHOLDS.PUSH_MAX_DAYS_FOR_POSITIVE;
  const matureRepo = ageDays >= THRESHOLDS.AGE_MIN_DAYS_FOR_POSITIVE;

  if (activePushed && matureRepo) {
    return {
      name: "ageVsPush",
      verdict: "positive",
      reason: `${ageDays}d old, pushed ${pushDays}d ago.`,
    };
  }
  if (activePushed && !matureRepo) {
    return {
      name: "ageVsPush",
      verdict: "neutral",
      reason: `Active but only ${ageDays}d old.`,
    };
  }
  return {
    name: "ageVsPush",
    verdict: "negative",
    reason:
      !activePushed
        ? `No push in ${pushDays}d.`
        : `Repo only ${ageDays}d old.`,
  };
}

const DAY = 1000 * 60 * 60 * 24;

// ─── Deploy-host detection (helper for the writer) ──────────────────────────

/**
 * Resolve the effective `externalUrl` field of the bundle. Prefer the
 * declared `homepage`; otherwise, if the repo is hosted on a known deploy
 * platform, return the `htmlUrl` (signals the dev took the explicit step
 * of publishing a site).
 *
 * Returns null when neither condition holds.
 */
export function resolveExternalUrl(
  homepage: string | null,
  htmlUrl: string
): string | null {
  const trimmed = (homepage ?? "").trim();
  if (trimmed) return trimmed;

  try {
    const url = new URL(htmlUrl);
    if (DEPLOY_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s))) {
      return htmlUrl;
    }
  } catch {
    // Malformed htmlUrl — treat as no deploy URL rather than crash.
  }
  return null;
}
