/**
 * Phase 8 — Repo category classifier.
 *
 * Pure function that picks one of four categories (plus `unspecified`) for a
 * GitHub repo based on already-fetched credibility signals + the repo owner
 * and portfolio user's GitHub login. The category drives downstream scoring
 * (see `rubrics.ts`) and the strengthening-suggestion filter.
 *
 * The classifier is deliberately coarse — the owner can override via the
 * coaching PATCH endpoint, and the override persists. Mis-classification
 * costs a chip change in the UI, not broken data.
 *
 * Thresholds live in {@link CATEGORY_THRESHOLDS} so tests can import them
 * and the rulebook is auditable in one place.
 */

import type {
  CredibilitySignals,
  RepoCategory,
} from "@/lib/credibility/types";

// ─── Thresholds ─────────────────────────────────────────────────────────────

export const CATEGORY_THRESHOLDS = {
  /** ≥ N contributors → lean OSS author (still requires you're the owner). */
  OSS_CONTRIBUTORS_MIN: 3,
  /** ≥ N stars → lean OSS author regardless of contributor count. */
  OSS_STARS_MIN: 10,
  /** personal_tool needs at least this many active days in the past year. */
  TOOL_ACTIVE_DAYS_MIN: 10,
  /** personal_tool also needs the repo to be at least this old (days). */
  TOOL_AGE_DAYS_MIN: 60,
} as const;

const DAY_MS = 1000 * 60 * 60 * 24;

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify a repo into one of the four Phase 8 categories.
 *
 * Branch order (first match wins):
 *   1. You are not the repo owner → `oss_contributor`. This is the strongest
 *      signal — you didn't start the project, so judging it by the repo's
 *      health is the wrong frame. We care about your fingerprint instead.
 *   2. You own it AND (≥3 contributors OR ≥10 stars) → `oss_author`. Public
 *      traction is present, apply the full rubric.
 *   3. You own it AND ≥10 active days in the past year AND repo is ≥60 days
 *      old → `personal_tool`. Sustained personal project.
 *   4. Otherwise → `personal_learning`. Default for short-lived solo work.
 *
 * Returns `unspecified` only when the input is so incomplete that we genuinely
 * can't judge (no repo owner, no user login). The caller should treat
 * `unspecified` as "don't apply a rubric" rather than as a category.
 */
export function classifyRepoCategory(
  signals: Pick<
    CredibilitySignals,
    "contributors" | "commitActivity" | "recency"
  >,
  userGithubLogin: string | null | undefined,
  repoOwner: string | null | undefined,
  stars: number | null | undefined
): RepoCategory {
  const login = (userGithubLogin ?? "").trim().toLowerCase();
  const owner = (repoOwner ?? "").trim().toLowerCase();

  if (!login || !owner) {
    return "unspecified";
  }

  // 1. Someone else's repo → contributor frame.
  if (owner !== login) {
    return "oss_contributor";
  }

  const contributors =
    signals.contributors.status === "ok" ? signals.contributors.count : 0;
  const starCount = typeof stars === "number" && stars >= 0 ? stars : 0;

  // 2. Your repo with public traction → OSS author.
  if (
    contributors >= CATEGORY_THRESHOLDS.OSS_CONTRIBUTORS_MIN ||
    starCount >= CATEGORY_THRESHOLDS.OSS_STARS_MIN
  ) {
    return "oss_author";
  }

  // 3. Your repo with sustained activity → personal tool.
  const activeDays =
    signals.commitActivity.status === "ok"
      ? signals.commitActivity.activeDayCount
      : 0;
  const ageDays = ageInDays(signals.recency);

  if (
    activeDays >= CATEGORY_THRESHOLDS.TOOL_ACTIVE_DAYS_MIN &&
    ageDays >= CATEGORY_THRESHOLDS.TOOL_AGE_DAYS_MIN
  ) {
    return "personal_tool";
  }

  // 4. Fallback — your repo, short-lived / small. Treat as learning.
  return "personal_learning";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ageInDays(
  recency: Pick<CredibilitySignals, "recency">["recency"]
): number {
  if (recency.status !== "ok") return 0;
  const created = new Date(recency.createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / DAY_MS));
}
