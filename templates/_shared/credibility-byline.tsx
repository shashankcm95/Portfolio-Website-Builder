import React from "react";
import type { ProjectCredibility, RepoCategory } from "./types";

interface CredibilityBylineProps {
  credibility: ProjectCredibility | undefined;
  /**
   * Optional. When provided, the byline shows a "View on GitHub" anchor
   * inline alongside the credibility chips. Pass `project.repoUrl` from
   * the caller. Falsy ⇒ no anchor.
   */
  repoUrl?: string;
}

/**
 * Phase E2 — One-line credibility row: category, contributor count, CI /
 * tests / releases ticks, and a "Live →" link when the repo declares a
 * deploy URL. Renders only the chips that have signal — never a row of
 * empty placeholders.
 *
 * Returns null when `credibility` is undefined OR when no chip would
 * have content. Templates can branch on the returned value being null
 * to skip a wrapper section.
 *
 * Class names follow the `pwb-` convention so each template's
 * `global.css` can theme them. The default markup is structurally simple
 * (a single ul with li chips) so even unstyled it degrades to a
 * comma-separated list of facts.
 */
export function CredibilityByline({
  credibility,
  repoUrl,
}: CredibilityBylineProps) {
  if (!credibility) return null;

  const chips: Array<{ key: string; node: React.ReactNode }> = [];

  // `formatCategory` returns null for `unspecified` (no useful badge to
  // render). Guard against pushing an empty chip in that case.
  const categoryLabel = credibility.category
    ? formatCategory(credibility.category)
    : null;
  if (categoryLabel) {
    chips.push({
      key: "category",
      node: <span className="pwb-credibility-category">{categoryLabel}</span>,
    });
  }

  if (
    typeof credibility.contributorCount === "number" &&
    credibility.contributorCount >= 1
  ) {
    chips.push({
      key: "contributors",
      node: (
        <span>
          {credibility.contributorCount}{" "}
          {credibility.contributorCount === 1 ? "contributor" : "contributors"}
        </span>
      ),
    });
  }

  if (credibility.hasCi) {
    chips.push({
      key: "ci",
      node: (
        <span title="This repo runs continuous integration on every push">
          <span aria-hidden="true">✓</span> CI
        </span>
      ),
    });
  }

  if (credibility.hasTests) {
    chips.push({
      key: "tests",
      node: (
        <span title="This repo declares a test framework">
          <span aria-hidden="true">✓</span> Tests
        </span>
      ),
    });
  }

  if (credibility.hasReleases) {
    chips.push({
      key: "releases",
      node: (
        <span title="This repo publishes versioned releases">
          <span aria-hidden="true">✓</span> Releases
        </span>
      ),
    });
  }

  if (credibility.externalUrl) {
    chips.push({
      key: "live",
      node: (
        <a
          className="pwb-credibility-live"
          href={credibility.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Live <span aria-hidden="true">→</span>
        </a>
      ),
    });
  }

  if (repoUrl) {
    chips.push({
      key: "repo",
      node: (
        <a
          className="pwb-credibility-repo"
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      ),
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul
      className="pwb-credibility-byline"
      aria-label="Project credibility signals"
    >
      {chips.map((c) => (
        <li key={c.key} className="pwb-credibility-chip">
          {c.node}
        </li>
      ))}
    </ul>
  );
}

/**
 * Render the Phase-8 repo category as human-readable copy. The enum
 * values are designed for code, not display — "oss_author" reads as
 * "OSS Author" in the byline, "personal_tool" as "Personal tool", etc.
 * `unspecified` returns null so callers don't surface a meaningless
 * "Unspecified" badge.
 */
function formatCategory(c: RepoCategory): string | null {
  switch (c) {
    case "oss_author":
      return "OSS Author";
    case "oss_contributor":
      return "OSS Contributor";
    case "personal_tool":
      return "Personal tool";
    case "personal_learning":
      return "Personal project";
    case "unspecified":
    default:
      return null;
  }
}
