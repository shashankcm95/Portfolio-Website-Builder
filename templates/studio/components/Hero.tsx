import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * Studio hero. Left column: eyebrow (availability), headline with one
 * italicized phrase for texture, bio, twin CTAs (primary = hire / secondary
 * = view work). Right column: anchor-stat card (the single strongest
 * credential, isolated on its own surface so it reads as a testimonial
 * to the work, not a bullet point).
 *
 * The italic span inside the headline comes from the positioning
 * sentence — we italicize the final clause when the positioning contains
 * one. Pure presentational flourish, skipped silently when not applicable.
 */
export function Hero({ basics }: HeroProps) {
  const { anchorStat, namedEmployers, summary, hiring, positioning, label } =
    basics;
  const headline = positioning || label;
  // Phase R4 — explicit null-safety on the CTA copy. The original code
  // fell through to "Let's build something" even when `hiring` was
  // undefined, implying availability the owner hadn't claimed. Now the
  // CTA text is driven entirely by the three resolvable shapes:
  //   - explicit hiring.ctaText wins if set
  //   - hiring.status === "available" → the "build something" pitch
  //   - hiring.status === "open"      → the softer "start a conversation"
  //   - no hiring object at all       → neutral "get in touch"
  const ctaPrimaryText =
    hiring?.ctaText ||
    (hiring?.status === "available"
      ? "Let's build something"
      : hiring?.status === "open"
        ? "Start a conversation"
        : "Get in touch");
  const ctaPrimaryHref = hiring?.ctaHref || "/contact/";

  return (
    <section className="hero-section">
      <div className="container hero-grid">
        <div>
          {(hiring?.status === "available" || hiring?.status === "open") && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--color-accent)",
                margin: 0,
              }}
            >
              {hiring.status === "available"
                ? "Taking new work"
                : "Open to conversations"}
            </p>
          )}

          <h1 className="hero-headline">{renderHeadline(headline)}</h1>

          <p className="hero-sub">{summary}</p>

          <div className="hero-ctas">
            <a className="btn-primary" href={ctaPrimaryHref}>
              {ctaPrimaryText}
            </a>
            <a className="btn-ghost" href="/projects/">
              See work
            </a>
          </div>

          {namedEmployers && namedEmployers.length > 0 && (
            <p
              style={{
                marginTop: 28,
                color: "var(--color-faint)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Trusted by{" "}
              <span style={{ color: "var(--color-text)" }}>
                {namedEmployers.join(" · ")}
              </span>
            </p>
          )}

          {/* Phase E8b — Tier-1 universal recruiter signals. */}
          <HeroSignals basics={basics} />
        </div>

        {anchorStat && (
          <aside className="hero-anchor-card" aria-label="Signature stat">
            <p className="anchor-label">
              {anchorStat.context || "Signature"}
            </p>
            <p className="anchor-value">{anchorStat.value}</p>
            <p className="anchor-unit">{anchorStat.unit}</p>
          </aside>
        )}
      </div>
    </section>
  );
}

/**
 * Italicize the final clause after " — ", " – ", or a comma if one exists;
 * otherwise italicize the last 2 words. Purely decorative — keeps the
 * Fraunces italic glyphs in play without the user having to think about it.
 */
function renderHeadline(raw: string): React.ReactNode {
  if (!raw) return raw;
  const match = raw.match(/^(.*?)([—–-]|,)\s+(.+)$/);
  if (match) {
    return (
      <>
        {match[1].trim()}
        {match[2]} <em>{match[3].trim()}</em>
      </>
    );
  }
  const words = raw.trim().split(/\s+/);
  if (words.length <= 2) return raw;
  const tail = words.slice(-2).join(" ");
  const head = words.slice(0, -2).join(" ");
  return (
    <>
      {head} <em>{tail}</em>
    </>
  );
}
