/**
 * Phase 8 — Deterministic one-line characterization of a repo.
 *
 * Generates the muted byline that appears on the published portfolio when
 * the owner opts in (`showCharacterizationOnPortfolio`). The copy is
 * intentionally honest: a 3-week solo build is described as such, never
 * dressed up. The goal is *description* (so a recruiter has the right
 * frame when reading the project's verified claims), not grade.
 *
 * Deterministic — no LLM, no randomness. Same signals + category → same
 * string. Never throws; falls back to a bare repo-name line if signals are
 * too thin to say anything useful.
 */

import type {
  CredibilitySignals,
  RepoCategory,
} from "@/lib/credibility/types";

const DAY_MS = 1000 * 60 * 60 * 24;

interface CharacterizationInput {
  category: RepoCategory;
  signals: CredibilitySignals;
  /** GitHub owner login — needed for the oss_contributor variant. */
  repoOwner?: string | null;
  /** GitHub repo name — used for fallback + oss_contributor variant. */
  repoName?: string | null;
  /** Public star count from `RepoMetadata.stargazersCount`. */
  stars?: number | null;
  /** Total commit count if you want to mention it (personal_learning). */
  totalCommits?: number | null;
}

/**
 * Produce the portfolio byline. Safe to call with minimal input — returns
 * a plain "GitHub project." line when nothing useful can be said.
 */
export function generateCharacterization(input: CharacterizationInput): string {
  const { category, signals } = input;

  switch (category) {
    case "personal_learning":
      return learningLine(input);
    case "personal_tool":
      return toolLine(input);
    case "oss_author":
      return ossAuthorLine(input);
    case "oss_contributor":
      return ossContributorLine(input);
    case "unspecified":
    default:
      return fallbackLine(input);
  }
  // The switch is exhaustive; signals unused here may be used in helpers.
  void signals;
}

// ─── Per-category formatters ────────────────────────────────────────────────

function learningLine(input: CharacterizationInput): string {
  const age = ageDays(input.signals);
  const activeDays = activeDayCount(input.signals);
  const commits = input.totalCommits ?? commitTotal(input.signals);

  const parts: string[] = [];
  if (age > 0) parts.push(`${age}-day exploratory build`);
  else parts.push("exploratory build");

  if (commits > 0 && activeDays > 0) {
    parts.push(
      `${commits} commit${commits === 1 ? "" : "s"} across ${activeDays} day${activeDays === 1 ? "" : "s"}`
    );
  } else if (commits > 0) {
    parts.push(`${commits} commit${commits === 1 ? "" : "s"}`);
  }

  return joinParts(parts) || fallbackLine(input);
}

function toolLine(input: CharacterizationInput): string {
  const months = Math.max(1, Math.floor(ageDays(input.signals) / 30));
  const activeDays = activeDayCount(input.signals);
  const host = hostFromUrl(input.signals.externalUrl);

  const parts: string[] = [];
  parts.push(
    `Solo side project — ${months} month${months === 1 ? "" : "s"}`
  );
  if (activeDays > 0) {
    parts.push(`${activeDays} active day${activeDays === 1 ? "" : "s"}`);
  }
  if (host) parts.push(`deployed at ${host}`);

  return joinParts(parts) || fallbackLine(input);
}

function ossAuthorLine(input: CharacterizationInput): string {
  const stars = input.stars ?? 0;
  const contributors =
    input.signals.contributors.status === "ok"
      ? input.signals.contributors.count
      : 0;
  const latestTag =
    input.signals.releases.status === "ok"
      ? input.signals.releases.latestTag
      : null;

  const parts: string[] = ["Open-source project"];
  if (stars > 0) parts.push(`${stars} star${stars === 1 ? "" : "s"}`);
  if (contributors > 0) {
    parts.push(`${contributors} contributor${contributors === 1 ? "" : "s"}`);
  }
  if (latestTag) parts.push(latestTag);

  return joinParts(parts) || fallbackLine(input);
}

function ossContributorLine(input: CharacterizationInput): string {
  const owner = (input.repoOwner ?? "").trim();
  const name = (input.repoName ?? "").trim();
  const total =
    input.signals.commits.status === "ok" ? input.signals.commits.total : 0;
  const contributors =
    input.signals.contributors.status === "ok"
      ? input.signals.contributors.count
      : 0;

  // "Contributor to owner/repo — 5 contributors total."
  // We deliberately avoid reporting a specific personal-commit share because
  // we don't currently fetch per-contributor breakdowns. A vague "contributor
  // to" frame is honest about the signal we have.
  const parts: string[] = [];
  if (owner && name) {
    parts.push(`Contributor to ${owner}/${name}`);
  } else if (name) {
    parts.push(`Contributor to ${name}`);
  } else {
    parts.push("Open-source contributor");
  }
  if (contributors > 0) {
    parts.push(
      `${contributors} contributor${contributors === 1 ? "" : "s"} total`
    );
  } else if (total > 0) {
    parts.push(`${total} commit${total === 1 ? "" : "s"} in project`);
  }

  return joinParts(parts) || fallbackLine(input);
}

function fallbackLine(input: CharacterizationInput): string {
  const name = (input.repoName ?? "").trim();
  return name ? `GitHub project — ${name}.` : "GitHub project.";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ageDays(signals: CredibilitySignals): number {
  if (signals.recency.status !== "ok") return 0;
  const created = new Date(signals.recency.createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / DAY_MS));
}

function activeDayCount(signals: CredibilitySignals): number {
  return signals.commitActivity.status === "ok"
    ? signals.commitActivity.activeDayCount
    : 0;
}

function commitTotal(signals: CredibilitySignals): number {
  return signals.commits.status === "ok" ? signals.commits.total : 0;
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  const [head, ...rest] = parts;
  if (rest.length === 0) return endWithPeriod(head);
  // First separator is em-dash to introduce the description, subsequent
  // separators are the "·" mid-dot for compact reads.
  return endWithPeriod(`${head} · ${rest.join(" · ")}`);
}

function endWithPeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
