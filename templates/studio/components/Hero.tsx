import React from "react";
import type { ProfileData, Testimonial } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
  /** First testimonial surfaced above the fold (Fix 1). Optional — hero
   *  renders cleanly without it. The full carousel remains below. */
  firstTestimonial?: Testimonial;
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
export function Hero({ basics, firstTestimonial }: HeroProps) {
  const { anchorStat, summary, hiring, positioning, label } = basics;
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

  // Fix 2 — availability badge class
  const badgeClass =
    hiring?.status === "available"
      ? "availability-badge"
      : "availability-badge is-open";
  const badgeText =
    hiring?.status === "available"
      ? "Taking new work"
      : "Open to conversations";

  // Fix 1 — inline first testimonial in hero zone (surfaced above fold)
  const testimonialMeta = firstTestimonial
    ? [firstTestimonial.authorTitle, firstTestimonial.authorCompany]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <section className="hero-section">
      <div className="container hero-grid">
        <div>
          {/* Fix 2 — proper status chip / availability badge */}
          {(hiring?.status === "available" || hiring?.status === "open") && (
            <p
              className={`animate-blur-fade-up ${badgeClass}`}
              style={{ "--d": "0ms" } as React.CSSProperties}
            >
              {badgeText}
            </p>
          )}

          <h1
            className="hero-headline animate-blur-fade-up"
            style={{ "--d": "120ms" } as React.CSSProperties}
          >
            {renderHeadline(headline)}
          </h1>

          <p
            className="hero-sub animate-blur-fade-up"
            style={{ "--d": "240ms" } as React.CSSProperties}
          >
            {summary}
          </p>

          <div
            className="hero-ctas animate-blur-fade-up"
            style={{ "--d": "360ms" } as React.CSSProperties}
          >
            <a className="btn-primary" href={ctaPrimaryHref}>
              {ctaPrimaryText}
            </a>
            <a className="btn-ghost" href="/projects/">
              See work
            </a>
          </div>

          {/* Phase E8b — Tier-1 universal recruiter signals. */}
          <HeroSignals basics={basics} />

          {/* Fix 1 — first testimonial surfaced above the fold, before
              the namedEmployers marquee. The full carousel still renders
              below the project grid. */}
          {firstTestimonial && (
            <figure
              className="hero-testimonial animate-blur-fade-up"
              style={{ "--d": "480ms" } as React.CSSProperties}
            >
              <blockquote>"{firstTestimonial.quote}"</blockquote>
              <figcaption>
                <strong>{firstTestimonial.authorName}</strong>
                {testimonialMeta && <span> · {testimonialMeta}</span>}
              </figcaption>
            </figure>
          )}
        </div>

        {anchorStat && (
          <aside
            className="hero-anchor-card animate-blur-fade-up"
            aria-label="Signature stat"
            style={{ "--d": "240ms" } as React.CSSProperties}
          >
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
