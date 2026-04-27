import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * The top-of-content hero block on the home page (not the rail).
 *
 * The layered claim hierarchy mirrors what the strongest portfolios do:
 *   1. `anchorStat` pill — "✦ 4k+ GitHub stars" — the single strongest
 *      credential, surfaced first. Skipped silently when Phase B's
 *      derivation found no candidate.
 *   2. `namedEmployers` eyebrow — "Previously at Apple, Klaviyo". Skipped
 *      when empty.
 *   3. `summary` — the bio paragraph. Capped at ~56ch via CSS.
 *   4. Hiring CTA — button only when `hiring.status === "available"`, or
 *      a muted variant when "open".
 */
export function Hero({ basics }: HeroProps) {
  const { anchorStat, namedEmployers, summary, hiring } = basics;

  return (
    <section className="hero" aria-label="Introduction">
      {anchorStat && (
        <div className="hero-anchor">
          <strong>{anchorStat.value}</strong>
          <span>{anchorStat.unit}</span>
          {anchorStat.context && <em>— {anchorStat.context}</em>}
        </div>
      )}

      {namedEmployers && namedEmployers.length > 0 && (
        <p className="hero-employers">
          Previously at <span>{namedEmployers.join(" · ")}</span>
        </p>
      )}

      {/* Phase E8b — Tier-1 universal recruiter signals. */}
      <HeroSignals basics={basics} />

      <p className="hero-summary">{summary}</p>

      {hiring && (
        <a
          className={`hero-cta ${hiring.status === "open" ? "is-open" : ""}`}
          href={hiring.ctaHref || "/contact/"}
        >
          {hiring.ctaText ||
            (hiring.status === "available"
              ? "Available for work — let's talk"
              : "Open to conversations")}
        </a>
      )}
    </section>
  );
}
