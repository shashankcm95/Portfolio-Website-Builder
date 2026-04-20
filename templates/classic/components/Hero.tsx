import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Editorial-style hero: asymmetric split with oversized serif name on the left,
 * portrait on the right, and a rule + tagline underneath.
 */
export function Hero({ basics }: HeroProps) {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-split">
          <div className="hero-text">
            <p className="hero-eyebrow">Portfolio &mdash; {new Date().getFullYear()}</p>
            <h1>{basics.name}</h1>
            <p className="hero-label">{basics.label}</p>
            <div className="hero-rule" />
            <p className="hero-summary">{basics.summary}</p>
            <div className="hero-links">
              {basics.email && (
                <a href={`mailto:${basics.email}`} className="btn btn-primary">
                  Get in Touch
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
