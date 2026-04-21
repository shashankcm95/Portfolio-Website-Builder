import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

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
          <p className="hero-label">{basics.label}</p>
          <p className="hero-summary">{truncate(basics.summary, 280)}</p>
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
