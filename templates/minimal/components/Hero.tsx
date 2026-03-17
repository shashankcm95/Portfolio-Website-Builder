import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Hero section for the home page.
 * Displays name, label, summary, avatar, and social links.
 */
export function Hero({ basics }: HeroProps) {
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
        <p className="hero-label">{basics.label}</p>
        <p className="hero-summary">{basics.summary}</p>
        <div className="hero-links">
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
          {basics.email && (
            <a href={`mailto:${basics.email}`} className="btn btn-primary">
              Get in Touch
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
