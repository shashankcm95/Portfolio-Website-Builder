/**
 * Phase 8 — Per-category scoring rubrics.
 *
 * Replaces the flat 6-factor rubric with category-aware composition. Each
 * category advertises which sub-scorers to run and whether a non-positive
 * verdict should surface as a "gap" (actionable) or be suppressed entirely
 * (not relevant to this kind of repo).
 *
 * Sub-scorers themselves live in `authorship.ts` and are unchanged — this
 * module just picks a subset and sorts the results into affirmations vs
 * gaps. Keeping the scorers centralized means their thresholds remain
 * auditable in one place.
 *
 *   Factor              | learning | tool              | oss-author | oss-contrib
 *   --------------------+----------+-------------------+------------+------------
 *   messageQuality      | show     | show              | show       | show
 *   commitDays          | hide     | show              | show       | hide
 *   ageVsPush           | hide     | show              | show       | hide
 *   collaboration       | hide     | show if >1 contr. | show       | show (reframed)
 *   releases            | hide     | show if positive  | show       | hide
 *   externalPresence    | hide     | show              | show       | hide
 */

import {
  scoreAgeVsPush,
  scoreCollaboration,
  scoreCommitDays,
  scoreExternalPresence,
  scoreMessageQuality,
  scoreReleases,
} from "@/lib/credibility/authorship";
import type {
  AuthorshipFactor,
  CredibilitySignals,
  RepoCategory,
} from "@/lib/credibility/types";

/**
 * A rubric entry pairs a sub-scorer with an optional "positive-only" flag.
 * When `positiveOnly` is true, the factor is omitted entirely unless the
 * sub-scorer returns `verdict === "positive"` — useful for optional factors
 * like releases on a personal tool project, where tagging one is a bonus
 * but not tagging one shouldn't be surfaced as a gap.
 */
interface RubricEntry {
  score: (s: CredibilitySignals) => AuthorshipFactor;
  positiveOnly?: boolean;
  /**
   * When set, the factor is only scored if the predicate holds. Used for
   * "show collaboration only if contributors > 1" on personal_tool repos.
   */
  only?: (s: CredibilitySignals) => boolean;
  /**
   * Optional override that rewrites the factor's `reason` string after
   * scoring — used for oss_contributor to reframe "N contributors" as
   * "contributed to N-contributor project" rather than rebuilding the
   * sub-scorer.
   */
  reframeReason?: (factor: AuthorshipFactor, s: CredibilitySignals) => string;
}

// ─── Rubric definitions ─────────────────────────────────────────────────────

const LEARNING_RUBRIC: readonly RubricEntry[] = [
  { score: scoreMessageQuality },
] as const;

const TOOL_RUBRIC: readonly RubricEntry[] = [
  { score: scoreMessageQuality },
  { score: scoreCommitDays },
  { score: scoreAgeVsPush },
  { score: scoreExternalPresence },
  // Solo tool by default; surface collaboration only if there's something to
  // collaborate about.
  {
    score: scoreCollaboration,
    only: (s) => s.contributors.status === "ok" && s.contributors.count > 1,
  },
  // Tagging a release on a personal tool is a win — show it when present,
  // omit entirely when absent. Not tagging a release isn't a personal-tool
  // failure.
  { score: scoreReleases, positiveOnly: true },
] as const;

const OSS_AUTHOR_RUBRIC: readonly RubricEntry[] = [
  { score: scoreMessageQuality },
  { score: scoreCommitDays },
  { score: scoreAgeVsPush },
  { score: scoreCollaboration },
  { score: scoreReleases },
  { score: scoreExternalPresence },
] as const;

const OSS_CONTRIBUTOR_RUBRIC: readonly RubricEntry[] = [
  { score: scoreMessageQuality },
  {
    score: scoreCollaboration,
    reframeReason: (factor, s) => {
      const count =
        s.contributors.status === "ok" ? s.contributors.count : 0;
      if (count >= 2) {
        return `Contributed to a project with ${count} contributor${count === 1 ? "" : "s"}.`;
      }
      return factor.reason;
    },
  },
] as const;

// unspecified falls through to the full 6-factor rubric so pre-Phase-8 callers
// reading presentation get the same shape they'd get from the legacy
// `factors` array. Not the same as `oss_author` semantically, but the
// surface is identical.
const UNSPECIFIED_RUBRIC = OSS_AUTHOR_RUBRIC;

const RUBRICS: Record<RepoCategory, readonly RubricEntry[]> = {
  personal_learning: LEARNING_RUBRIC,
  personal_tool: TOOL_RUBRIC,
  oss_author: OSS_AUTHOR_RUBRIC,
  oss_contributor: OSS_CONTRIBUTOR_RUBRIC,
  unspecified: UNSPECIFIED_RUBRIC,
};

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RubricResult {
  affirmations: AuthorshipFactor[];
  gaps: AuthorshipFactor[];
}

/**
 * Run the category's rubric over the signal bundle. Every factor the rubric
 * asks for is scored; the result is partitioned by verdict (positive →
 * affirmations, non-positive → gaps) with two exceptions:
 *
 *   - `positiveOnly` entries are dropped entirely when not positive.
 *   - `only` predicates skip the factor up front.
 *
 * The returned arrays are in rubric-declaration order, which is the order
 * we want to show in the UI (the rubric authoring decides prominence).
 */
export function scoreWithRubric(
  signals: CredibilitySignals,
  category: RepoCategory
): RubricResult {
  const rubric = RUBRICS[category] ?? UNSPECIFIED_RUBRIC;
  const affirmations: AuthorshipFactor[] = [];
  const gaps: AuthorshipFactor[] = [];

  for (const entry of rubric) {
    if (entry.only && !entry.only(signals)) continue;
    const factor = entry.score(signals);
    const finalized: AuthorshipFactor = entry.reframeReason
      ? { ...factor, reason: entry.reframeReason(factor, signals) }
      : factor;

    if (finalized.verdict === "positive") {
      affirmations.push(finalized);
      continue;
    }
    if (entry.positiveOnly) continue; // suppress non-positive
    gaps.push(finalized);
  }

  return { affirmations, gaps };
}

/**
 * Test/introspection helper — returns the list of factor names this
 * category's rubric will evaluate, in declaration order. Useful for
 * rendering factor chips deterministically without having to score first.
 */
export function rubricFactorNames(
  category: RepoCategory
): string[] {
  const rubric = RUBRICS[category] ?? UNSPECIFIED_RUBRIC;
  return rubric.map((entry) => entry.score.name.replace(/^score/, "").replace(/^([A-Z])/, (c) => c.toLowerCase()));
}
