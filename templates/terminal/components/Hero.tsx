import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Terminal Hero. Renders as `$ whoami` then prints the
 * owner's name (in green @username form), label (yellow comment),
 * summary (dim prose), and inline social links.
 */
export function Hero({ basics }: HeroProps) {
  const handle = basics.name.split(/\s+/).join("").toLowerCase();
  return (
    <section className="hero">
      <div className="container">
        <p className="prompt">whoami</p>
        <h1 className="hero-name">
          {basics.name} <span className="at">@{handle}</span>
        </h1>
        <p className="hero-label"># {basics.label}</p>
        <p className="hero-summary">{basics.summary}</p>
        <p className="hero-links">
          {basics.email && (
            <a href={`mailto:${basics.email}`}>--email {basics.email}</a>
          )}
          {basics.profiles.map((p) => (
            <a
              key={p.network}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              --{p.network.toLowerCase()}
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
