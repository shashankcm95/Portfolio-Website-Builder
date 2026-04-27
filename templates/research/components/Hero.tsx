import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Research template Hero.
 *
 * Mirrors the Karpathy / colah pattern: small round avatar on the
 * left, name + tagline + ≤50-word bio on the right, social links
 * inline. No CTAs, no big buttons — the page itself is the call.
 */
export function Hero({ basics }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero-inner">
        {basics.avatar && (
          <img
            src={basics.avatar}
            alt={`${basics.name} portrait`}
            className="hero-avatar"
            width={88}
            height={88}
          />
        )}
        <div className="hero-text">
          <h1 className="hero-name">{basics.name}</h1>
          <p className="hero-label">{basics.positioning || basics.label}</p>
          {/* Phase R4 — anchor + employers in an academic "at a glance"
              footnote style. No CTA button — the template's philosophy
              (per Phase 7 Hero comment) is that the page itself is the
              call to action. Hire status surfaces as a subtle text line
              when available, consistent with the template's quiet voice. */}
          {basics.anchorStat && (
            <p className="hero-anchor">
              <strong>{basics.anchorStat.value}</strong>{" "}
              {basics.anchorStat.unit}
              {basics.anchorStat.context && (
                <span className="hero-anchor-context">
                  {" "}— {basics.anchorStat.context}
                </span>
              )}
            </p>
          )}
          {/* Phase E8b — Tier-1 universal recruiter signals. */}
          <HeroSignals basics={basics} />

          {basics.namedEmployers && basics.namedEmployers.length > 0 && (
            <p className="hero-employers">
              Previously at {basics.namedEmployers.join(", ")}
            </p>
          )}
          <p className="hero-summary">{truncate(basics.summary, 280)}</p>
          {basics.hiring && basics.hiring.status !== "not-looking" && (
            <p className="hero-hiring">
              {basics.hiring.status === "available"
                ? "Available for new work."
                : "Open to conversations."}{" "}
              {/* Phase E6 — always show the CTA when hiring is set; default
                  to /contact/ when no explicit ctaHref. Pre-E6 this required
                  the owner to set ctaHref or the link would be missing,
                  leaving recruiters with nothing to click. */}
              <a href={basics.hiring.ctaHref || "/contact/"}>
                {basics.hiring.ctaText || "Get in touch"}
              </a>
            </p>
          )}
          <p className="hero-links">
            {basics.email && (
              <a href={`mailto:${basics.email}`}>{basics.email}</a>
            )}
            {basics.profiles.map((profile) => (
              <a
                key={profile.network}
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {profile.network}
              </a>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Phase R7 — word-boundary truncation. Cutting at the raw byte limit
 * produces ugly mid-word stops like "Over…". We trim back to the last
 * whitespace inside the limit; if there's no whitespace within reach
 * (a single very long word) we fall back to the byte cut so we don't
 * return an empty string.
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Look for a sensible boundary in the last ~40 chars of the budget.
  const slice = s.slice(0, max - 1);
  const cut = slice.search(/\s\S*$/);
  if (cut > max - 80) {
    return slice.slice(0, cut).trimEnd() + "…";
  }
  return slice.trimEnd() + "…";
}
