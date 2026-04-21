/**
 * Phase 7 — Composite layout-review score (0-100).
 *
 * Severity weighting:
 *   - critical: -15 each (capped: 5 criticals → 25)
 *   - warning:  -3 each
 *   - info:     0 (advisory only)
 *
 * Floor at 0, ceiling at 100. Deterministic and unit-tested.
 *
 * Rationale: a portfolio with one missing alt tag (warning) shouldn't
 * tank below 95. A portfolio whose hero name wraps on mobile (critical)
 * should drop visibly into the 80s. Five+ criticals = below 25.
 *
 * The formula is intentionally simple — owners read it as "subtract
 * 15 per critical, 3 per warning". Anything fancier (logarithmic,
 * weighted by page) would need explanation in the UI.
 */

import type { IssueSeverity, LayoutIssue } from "./types";

const WEIGHTS: Record<IssueSeverity, number> = {
  critical: 15,
  warning: 3,
  info: 0,
};

/**
 * Compute the composite score from an issue list. Returns an integer
 * 0-100. An empty issue list → 100.
 */
export function computeScore(issues: LayoutIssue[]): number {
  let penalty = 0;
  for (const issue of issues) {
    penalty += WEIGHTS[issue.severity] ?? 0;
  }
  const score = 100 - penalty;
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Group issues by severity for a sortable summary. Critical first,
 * then warning, then info — matches the UI's collapse order.
 */
export function groupBySeverity(
  issues: LayoutIssue[]
): Record<IssueSeverity, LayoutIssue[]> {
  return {
    critical: issues.filter((i) => i.severity === "critical"),
    warning: issues.filter((i) => i.severity === "warning"),
    info: issues.filter((i) => i.severity === "info"),
  };
}

/**
 * Human label for the score band. Used in the UI badge.
 */
export function scoreBand(score: number | null): {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
} {
  if (score === null) return { label: "—", tone: "neutral" };
  if (score >= 90) return { label: "Excellent", tone: "green" };
  if (score >= 75) return { label: "Good", tone: "green" };
  if (score >= 60) return { label: "Needs polish", tone: "amber" };
  if (score >= 40) return { label: "Several issues", tone: "amber" };
  return { label: "Major issues", tone: "red" };
}
