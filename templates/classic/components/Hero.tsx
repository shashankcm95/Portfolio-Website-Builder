import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Editorial-style hero: asymmetric split with oversized serif name on the left,
 * portrait on the right, and a rule + tagline underneath.
 *
 * Phase R4 — Renders the proof-backed fields (anchor stat, named
 * employers, hire CTA) when set. Positioning supersedes label as the
 * tagline when present.
 */
export function Hero({ basics }: HeroProps) {
  const tagline = basics.positioning || basics.label;
  const showHireCta =
    basics.hiring && basics.hiring.status !== "not-looking";
  // Phase E6 — default to /contact/ rather than a mailto: fallback.
  // Mailto opens an email client / Chrome popup that feels broken to
  // most recruiters. Owners can still set `ctaHref` to mailto /
  // Calendly / form explicitly via the editor.
  const hireHref = basics.hiring?.ctaHref || "/contact/";
  const hireLabel =
    basics.hiring?.ctaText ||
    (basics.hiring?.status === "available"
      ? "Available — let's talk"
      : "Open to conversations");

  return (
    <section className="hero">
      <div className="container">
        <div className="hero-split">
          <div className="hero-text">
            <p className="hero-eyebrow">Portfolio &mdash; {new Date().getFullYear()}</p>
            <h1>{basics.name}</h1>
            <p className="hero-label">{tagline}</p>
            <div className="hero-rule" />

            {basics.anchorStat && (
              <p className="hero-anchor">
                <strong>{basics.anchorStat.value}</strong>{" "}
                {basics.anchorStat.unit}
                {basics.anchorStat.context && (
                  <span className="hero-anchor-context">
                    {" "}
                    — {basics.anchorStat.context}
                  </span>
                )}
              </p>
            )}

            {basics.namedEmployers && basics.namedEmployers.length > 0 && (
              <p className="hero-employers">
                Previously at{" "}
                <span>{basics.namedEmployers.join(" · ")}</span>
              </p>
            )}

            {/* Phase E8b — Tier-1 universal recruiter signals. */}
            <HeroSignals basics={basics} />

            <p className="hero-summary">{basics.summary}</p>
            <div className="hero-links">
              {showHireCta ? (
                <a href={hireHref} className="btn btn-primary">
                  {hireLabel}
                </a>
              ) : (
                basics.email && (
                  <a href={`mailto:${basics.email}`} className="btn btn-primary">
                    Get in Touch
                  </a>
                )
              )}
              {basics.profiles.map((profile) => (
                <a
                  key={profile.network}
                  href={profile.url}
                  className="btn btn-outline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {profile.network}
                </a>
              ))}
            </div>
          </div>
          {basics.avatar && (
            <div className="hero-portrait">
              <img
                src={basics.avatar}
                alt={`${basics.name} portrait`}
                className="hero-avatar"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
