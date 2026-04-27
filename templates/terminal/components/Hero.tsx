import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Terminal Hero. Renders as `$ whoami` then prints the
 * owner's name (in green @username form), label (yellow comment),
 * summary (dim prose), and inline social links.
 *
 * Phase R4 — New proof-backed fields surface as additional CLI-style
 * lines: anchor stat as `$ echo "…"`, employers as a `#` comment,
 * hire status as an `export STATUS=…` line. All optional, so a
 * minimal portfolio still renders the classic tight hero.
 */
export function Hero({ basics }: HeroProps) {
  const handle = basics.name.split(/\s+/).join("").toLowerCase();
  const tagline = basics.positioning || basics.label;
  return (
    <section className="hero">
      <div className="container">
        <p className="prompt">whoami</p>
        <h1 className="hero-name">
          {basics.name} <span className="at">@{handle}</span>
        </h1>
        <p className="hero-label"># {tagline}</p>

        {basics.anchorStat && (
          <p className="hero-anchor">
            <span className="prompt-inline">$</span> echo{" "}
            <span className="str">
              &quot;{basics.anchorStat.value} {basics.anchorStat.unit}
              {basics.anchorStat.context
                ? ` — ${basics.anchorStat.context}`
                : ""}
              &quot;
            </span>
          </p>
        )}

        {basics.namedEmployers && basics.namedEmployers.length > 0 && (
          <p className="hero-employers">
            # previously at {basics.namedEmployers.join(", ")}
          </p>
        )}

        <p className="hero-summary">{basics.summary}</p>

        {basics.hiring && basics.hiring.status !== "not-looking" && (
          <p className="hero-hiring">
            <span className="prompt-inline">$</span>{" "}
            <span className="kw">export</span> STATUS=
            <span className="str">
              &quot;
              {basics.hiring.status === "available" ? "available" : "open"}
              &quot;
            </span>
            {/* Phase E6 — default to /contact/ when no explicit ctaHref. */}
            {"  "}
            <a href={basics.hiring.ctaHref || "/contact/"}>
              → {basics.hiring.ctaText || "contact"}
            </a>
          </p>
        )}

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
