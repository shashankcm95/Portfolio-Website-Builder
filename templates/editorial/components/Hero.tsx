import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Editorial Hero. Eyebrow + display-face name + italic
 * label + summary. No avatar (the typography is the hero); social
 * links inline below.
 */
export function Hero({ basics }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <p className="hero-eyebrow">Portfolio · {new Date().getFullYear()}</p>
        <h1 className="hero-name">{basics.name}</h1>
        <p className="hero-label">{basics.label}</p>
        <p className="hero-summary">{basics.summary}</p>
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
