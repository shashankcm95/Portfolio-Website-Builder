import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Editorial Hero. Eyebrow + display-face name + italic
 * label + summary. No avatar (the typography is the hero); social
 * links inline below.
 *
 * Phase R4 — anchor stat rendered as an italic metric line, named
 * employers in smallcaps eyebrow style, hiring CTA as an
 * italicized call-out. Consistent with the typography-first voice.
 */
export function Hero({ basics }: HeroProps) {
  const tagline = basics.positioning || basics.label;
  const showHire = basics.hiring && basics.hiring.status !== "not-looking";
  return (
    <section className="hero">
      <div className="hero-inner">
        <p className="hero-eyebrow">Portfolio · {new Date().getFullYear()}</p>
        <h1 className="hero-name">{basics.name}</h1>
        <p className="hero-label">{tagline}</p>

        {basics.anchorStat && (
          <p className="hero-anchor">
            <strong>{basics.anchorStat.value}</strong>{" "}
            <em>{basics.anchorStat.unit}</em>
            {basics.anchorStat.context && (
              <span className="hero-anchor-context">
                {" "}
                — {basics.anchorStat.context}
              </span>
            )}
          </p>
        )}

        {/* Phase E8b — Tier-1 universal recruiter signals. */}
        <HeroSignals basics={basics} />

        {basics.namedEmployers && basics.namedEmployers.length > 0 && (
          <p className="hero-employers">
            Previously at <span>{basics.namedEmployers.join(" · ")}</span>
          </p>
        )}

        <p className="hero-summary">{basics.summary}</p>

        {showHire && (
          <p className="hero-hiring">
            <em>
              {basics.hiring!.status === "available"
                ? "Available for new work."
                : "Open to conversations."}
            </em>
            {/* Phase E6 — default to /contact/ when no explicit ctaHref. */}
            {" "}
            <a href={basics.hiring!.ctaHref || "/contact/"}>
              {basics.hiring!.ctaText || "Get in touch"} →
            </a>
          </p>
        )}

        <p className="hero-links">
          {basics.email && (
            <a href={`mailto:${basics.email}`}>Email</a>
          )}
          {basics.profiles.map((p) => (
            <a
              key={p.network}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {p.network}
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
