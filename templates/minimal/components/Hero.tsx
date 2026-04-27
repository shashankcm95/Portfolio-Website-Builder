import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Hero section for the home page.
 *
 * Phase R4 — retrofitted to render the proof-backed fields added in
 * Phase A/B (anchorStat, namedEmployers, hiring) when they're set.
 * All four additions are optional; a portfolio without them looks
 * identical to the original. `positioning` (user-curated) takes
 * precedence over `label` (resume-derived) when present.
 */
export function Hero({ basics }: HeroProps) {
  const tagline = basics.positioning || basics.label;
  const showHireCta =
    basics.hiring && basics.hiring.status !== "not-looking";
  // Phase E6 — default to the in-site Contact page rather than a
  // `mailto:` link. The mailto fallback opens the visitor's email
  // client (or, in Chrome, a small popup) which feels broken — most
  // recruiters expect the button to take them to a contact page.
  // The owner can still set `ctaHref` to a mailto / Calendly / form
  // explicitly via the editor when they want a different target.
  const hireHref = basics.hiring?.ctaHref || "/contact/";
  const hireLabel =
    basics.hiring?.ctaText ||
    (basics.hiring?.status === "available"
      ? "Available — let's talk"
      : "Open to conversations");

  return (
    <section className="hero">
      <div className="container">
        {basics.avatar && (
          <img
            src={basics.avatar}
            alt={`${basics.name} avatar`}
            className="hero-avatar"
          />
        )}
        <h1>{basics.name}</h1>
        <p className="hero-label">{tagline}</p>

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
            Previously at <span>{basics.namedEmployers.join(" · ")}</span>
          </p>
        )}

        <p className="hero-summary">{basics.summary}</p>

        <div className="hero-links">
          {showHireCta && (
            <a href={hireHref} className="btn btn-primary">
              {hireLabel}
            </a>
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
          {basics.email && !showHireCta && (
            <a href={`mailto:${basics.email}`} className="btn btn-primary">
              Get in Touch
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
