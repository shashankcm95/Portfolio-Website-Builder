/**
 * Improvement suggestions — the *inverse* of the authorship scorer.
 *
 * For each factor that scored non-positive, this emits one actionable,
 * content-mapped suggestion describing how the developer can move the
 * factor toward positive. The suggestion list is deterministic (no LLM),
 * ordered by estimated impact, and stable across renders.
 *
 * Chatbot-powered "deep dive" help (e.g., templated ci.yml for this
 * project's stack) is deferred to Phase 5. Each suggestion exposes a
 * stable `id` so the future chatbot wire-up can route cleanly.
 */

import type {
  AuthorshipFactor,
  AuthorshipFactorName,
  CredibilitySignals,
  RepoCategory,
} from "@/lib/credibility/types";
import { scoreAuthorship } from "@/lib/credibility/authorship";

// ─── Public types ───────────────────────────────────────────────────────────

export type SuggestionId =
  | "spread-commits"
  | "commit-messages-descriptive"
  | "use-prs"
  | "tag-release"
  | "add-homepage-url"
  | "keep-active"
  | "add-ci"
  | "add-test-framework";

export type SuggestionImpact =
  | "negative-to-positive"
  | "negative-to-neutral"
  | "neutral-to-positive";

/**
 * Effort estimate surfaced in the coaching UI. Used to sort the aggregate
 * modal so the developer can plan a "weekend todo list" without opening
 * each project.
 */
export type SuggestionEffort = "5min" | "30min" | "1h+";

export interface Suggestion {
  id: SuggestionId;
  title: string;
  description: string;
  factorAffected: AuthorshipFactorName;
  impact: SuggestionImpact;
  effort: SuggestionEffort;
  /**
   * Which Phase 8 categories this suggestion is relevant to. A suggestion
   * never appears on a project whose category isn't in this list —
   * `tag-release` is hidden on `personal_learning`, for example.
   *
   * `unspecified` always matches so legacy rows get the full catalog.
   */
  categories: RepoCategory[];
  helpUrl?: string;
}

// ─── Content table ──────────────────────────────────────────────────────────

/**
 * Static content for each suggestion. Kept as a table so copy edits live
 * in one place and every entry has a uniform shape. `impact` is dynamic
 * (depends on the factor's current verdict) and is NOT stored here.
 */
export const SUGGESTION_CONTENT: Record<
  SuggestionId,
  Omit<Suggestion, "impact">
> = {
  "spread-commits": {
    id: "spread-commits",
    title: "Spread development across more days",
    description:
      "Your recent work lives in just a few commits. Try committing incremental changes across separate sessions so the cadence signal reflects real work.",
    factorAffected: "commitDays",
    effort: "1h+",
    categories: ["personal_tool", "oss_author", "unspecified"],
    helpUrl: "https://git-scm.com/docs/git-commit",
  },
  "commit-messages-descriptive": {
    id: "commit-messages-descriptive",
    title: "Write descriptive commit messages",
    description:
      "Messages like \"fix\" or \"wip\" don't tell reviewers what changed. Try formats like \"Add JWT middleware to auth routes\" — or adopt Conventional Commits (feat:, fix:, chore:).",
    factorAffected: "messageQuality",
    effort: "5min",
    // Descriptive messages are a universal win across every category.
    categories: [
      "personal_learning",
      "personal_tool",
      "oss_author",
      "oss_contributor",
      "unspecified",
    ],
    helpUrl: "https://www.conventionalcommits.org/",
  },
  "use-prs": {
    id: "use-prs",
    title: "Use pull requests, even on solo projects",
    description:
      "Merging changes via PRs (even self-reviewed) signals a professional workflow. Recruiters look for branching and review discipline.",
    factorAffected: "collaboration",
    effort: "30min",
    // A personal learning repo doesn't need branch/PR ceremony; oss_contributor
    // already works via PRs upstream.
    categories: ["personal_tool", "oss_author", "unspecified"],
    helpUrl:
      "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests",
  },
  "tag-release": {
    id: "tag-release",
    title: "Tag a release",
    description:
      "Tagging a release (even v0.1.0) shows intentional versioning. GitHub releases are visible on the repo homepage and in our credibility signals.",
    factorAffected: "releases",
    effort: "5min",
    categories: ["personal_tool", "oss_author", "unspecified"],
    helpUrl:
      "https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository",
  },
  "add-homepage-url": {
    id: "add-homepage-url",
    title: "Add a homepage URL to the repo",
    description:
      "If your project is deployed, set the repository's homepage field to the live URL. Recruiters should be one click away from seeing it run.",
    factorAffected: "externalPresence",
    effort: "5min",
    categories: ["personal_tool", "oss_author", "unspecified"],
    helpUrl:
      "https://docs.github.com/en/repositories/creating-and-managing-repositories/editing-your-repository-details",
  },
  "keep-active": {
    id: "keep-active",
    title: "Keep the project active",
    description:
      "Recent pushes and a repo that's had time to evolve both strengthen the signal. Consider committing small improvements over the next few weeks.",
    factorAffected: "ageVsPush",
    effort: "1h+",
    categories: ["personal_tool", "oss_author", "unspecified"],
  },
  "add-ci": {
    id: "add-ci",
    title: "Add a CI workflow",
    description:
      "A GitHub Actions workflow that runs on every push is the clearest signal of professional practice. Even a 10-line ci.yml that runs your tests is enough.",
    factorAffected: "collaboration", // CI contributes to collaboration signal indirectly; not a Phase 2 factor directly
    effort: "30min",
    categories: ["personal_tool", "oss_author", "unspecified"],
    helpUrl: "https://docs.github.com/en/actions/quickstart",
  },
  "add-test-framework": {
    id: "add-test-framework",
    title: "Add a test framework",
    description:
      "Projects without a detected test framework read as unfinished. Add Jest / Vitest / pytest to your dev dependencies and write a small test suite.",
    factorAffected: "messageQuality", // proxy — shows professionalism; not a direct factor
    effort: "30min",
    categories: ["personal_tool", "oss_author", "unspecified"],
  },
};

// ─── Pure API ───────────────────────────────────────────────────────────────

/**
 * Walk the authorship factors and emit content-mapped suggestions for each
 * non-positive factor. Ordered by impact:
 *   1. negative → positive  (biggest gain per action)
 *   2. negative → neutral
 *   3. neutral  → positive
 *
 * Within an impact bucket, suggestions are ordered by the canonical factor
 * order so the list doesn't shuffle between renders.
 *
 * Phase 8 — `options.category` filters out suggestions that don't apply to
 * the repo's kind (no "tag a release" prompts on a 3-week learning build).
 * `options.dismissedIds` removes suggestions the owner has already
 * dismissed inline. Both default to the legacy behavior (show everything)
 * when omitted, so existing callers keep working.
 */
export function suggestImprovements(
  signals: CredibilitySignals,
  options?: {
    category?: RepoCategory;
    dismissedIds?: readonly string[];
  }
): Suggestion[] {
  const authorship = signals.authorshipSignal;
  if (authorship.status !== "ok") return [];

  const category = options?.category ?? "unspecified";
  const dismissed = new Set<string>(options?.dismissedIds ?? []);

  const suggestions: Suggestion[] = [];
  for (const factor of authorship.factors) {
    if (factor.verdict === "positive") continue;

    const entry = suggestionFor(factor);
    if (!entry) continue;

    // Phase 8 — skip suggestions that don't apply to this category.
    if (!entry.categories.includes(category)) continue;
    // Phase 8 — skip dismissed suggestions.
    if (dismissed.has(entry.id)) continue;

    const impact = impactOf(factor);
    suggestions.push({ ...entry, impact });
  }

  // Stable ordering: by impact rank, then by factor index
  const impactRank: Record<SuggestionImpact, number> = {
    "negative-to-positive": 0,
    "negative-to-neutral": 1,
    "neutral-to-positive": 2,
  };
  const factorOrder: AuthorshipFactorName[] = [
    "commitDays",
    "messageQuality",
    "collaboration",
    "releases",
    "externalPresence",
    "ageVsPush",
  ];
  suggestions.sort((a, b) => {
    const i = impactRank[a.impact] - impactRank[b.impact];
    if (i !== 0) return i;
    return (
      factorOrder.indexOf(a.factorAffected) -
      factorOrder.indexOf(b.factorAffected)
    );
  });

  return suggestions;
}

/**
 * Convenience: derive suggestions directly from a bundle-like shape
 * *without* requiring `authorshipSignal` to be present (recomputes via
 * `scoreAuthorship`). Useful when a reader has a v1 row and we want to
 * offer suggestions before the next refresh rewrites as v2.
 */
export function suggestFromPartial(
  signals: Omit<CredibilitySignals, "authorshipSignal">,
  options?: {
    category?: RepoCategory;
    dismissedIds?: readonly string[];
  }
): Suggestion[] {
  const authorshipSignal = scoreAuthorship(signals as CredibilitySignals, {
    category: options?.category,
  });
  return suggestImprovements(
    {
      ...signals,
      authorshipSignal,
    } as CredibilitySignals,
    options
  );
}

/**
 * Aggregate view helper — returns ALL suggestions across a set of projects,
 * each tagged with the project id that produced it. Used by the Phase 8
 * coaching modal to render a cross-project "weekend todo list" sorted by
 * effort. The caller supplies dismissals per-project.
 */
export interface AggregatedSuggestion extends Suggestion {
  projectId: string;
  projectName: string;
}

export function aggregateSuggestions(
  inputs: readonly {
    projectId: string;
    projectName: string;
    signals: CredibilitySignals;
    category: RepoCategory;
    dismissedIds: readonly string[];
  }[]
): AggregatedSuggestion[] {
  const out: AggregatedSuggestion[] = [];
  for (const input of inputs) {
    const suggestions = suggestImprovements(input.signals, {
      category: input.category,
      dismissedIds: input.dismissedIds,
    });
    for (const s of suggestions) {
      out.push({
        ...s,
        projectId: input.projectId,
        projectName: input.projectName,
      });
    }
  }
  // Effort-first ordering — "5min" wins on top so the developer knocks out
  // quick wins first, then medium, then long.
  const effortRank: Record<SuggestionEffort, number> = {
    "5min": 0,
    "30min": 1,
    "1h+": 2,
  };
  out.sort((a, b) => {
    const e = effortRank[a.effort] - effortRank[b.effort];
    if (e !== 0) return e;
    return a.projectName.localeCompare(b.projectName);
  });
  return out;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function suggestionFor(
  factor: AuthorshipFactor
): Omit<Suggestion, "impact"> | null {
  switch (factor.name) {
    case "commitDays":
      return SUGGESTION_CONTENT["spread-commits"];
    case "messageQuality":
      return SUGGESTION_CONTENT["commit-messages-descriptive"];
    case "collaboration":
      return SUGGESTION_CONTENT["use-prs"];
    case "releases":
      return SUGGESTION_CONTENT["tag-release"];
    case "externalPresence":
      return SUGGESTION_CONTENT["add-homepage-url"];
    case "ageVsPush":
      return SUGGESTION_CONTENT["keep-active"];
    default:
      return null;
  }
}

function impactOf(factor: AuthorshipFactor): SuggestionImpact {
  if (factor.verdict === "negative") {
    // Most factors don't have a "neutral" band in the threshold table
    // (collaboration, releases, externalPresence) — for those, "negative"
    // can only move to "positive." commitDays, messageQuality, and
    // ageVsPush have an intermediate neutral, so we label the first-hop
    // impact as negative→neutral. The user sees both suggestions in order.
    const hasNeutralBand =
      factor.name === "commitDays" ||
      factor.name === "messageQuality" ||
      factor.name === "ageVsPush";
    return hasNeutralBand ? "negative-to-neutral" : "negative-to-positive";
  }
  return "neutral-to-positive";
}
