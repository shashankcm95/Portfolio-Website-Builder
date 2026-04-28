import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
  namedEmployers?: string[];
}

/**
 * Build the headline string + accent-word marker for the BlurText reveal.
 *
 * Strategy: take the positioning line (preferred) or label, split into
 * words, and italicize the LAST word (most semantically weighty in
 * "I build accessible, pixel-perfect *experiences*"). If the source
 * line is too short (≤2 words) we fall back to italicizing the second
 * word so the accent still has something to bite into.
 */
function pickAccentIndex(words: string[]): number {
  if (words.length <= 1) return -1;
  if (words.length === 2) return 1;
  // Penultimate word is often the noun the rest of the line modifies.
  // Last word might be terminal punctuation, so prefer second-to-last.
  return words.length - 1;
}

interface BlurTextHeadingProps {
  text: string;
  accentIndex?: number;
}

/**
 * §2.3 BlurText — pre-split words at SSR time. CSS animates each word
 * with `animation-delay: calc(var(--i) * 90ms)`. Above the fold (this
 * hero), no JS gating needed; the animation fires from CSS on parse.
 */
function BlurTextHeading({ text, accentIndex }: BlurTextHeadingProps) {
  const words = text.trim().split(/\s+/);
  const accent =
    typeof accentIndex === "number" ? accentIndex : pickAccentIndex(words);
  return (
    <h1 className="blur-text">
      {words.map((word, i) => {
        const isAccent = i === accent;
        const Tag = isAccent ? "em" : "span";
        // Strip a trailing period from the accent word — it usually reads
        // better as part of the surrounding text rather than embedded.
        const display = word;
        return (
          <Tag
            key={`${i}-${word}`}
            className="word"
            style={{ "--i": i } as React.CSSProperties}
          >
            {display}
          </Tag>
        );
      })}
    </h1>
  );
}

/**
 * Kinetic hero (Velorah / Aethera shape).
 *
 * Composition (z-stacked):
 *   - .hero-backdrop — CSS-animated radial gradient, sits at z:0
 *   - .kinetic-hero-content — z:1, holds eyebrow → BlurText → positioning
 *     subhead → "Previously at" line → anchor stat pill → CTAs
 *   - .kinetic-partners — z:1, partners marquee at the bottom
 *
 * When basics.heroVideoUrl is set, the .hero-backdrop element is
 * replaced with a real <video data-video="hero">. enhance.js wires
 * §2.4 rAF fade loop + §2.5 HLS bootstrap; Layout conditionally
 * loads scripts/hls.min.js when the URL ends in .m3u8. The CSS
 * gradient backdrop remains the fallback when the video can't load.
 */
function isHls(url: string): boolean {
  return /\.m3u8(\?.*)?$/i.test(url);
}

export function Hero({ basics, namedEmployers }: HeroProps) {
  const { name, positioning, label, anchorStat, hiring, summary, heroVideoUrl } =
    basics;
  const headlineText = positioning ?? label ?? `${name}, building things on the web`;
  const employers = namedEmployers ?? basics.namedEmployers ?? [];
  // Render a generous-enough partners list (>= 4 marquee items) by
  // duplicating shorter inputs so the seamless loop still works.
  const marqueeItems =
    employers.length > 0
      ? employers.length >= 4
        ? employers
        : [...employers, ...employers, ...employers].slice(0, 8)
      : [];

  const hasVideo = Boolean(heroVideoUrl);
  const videoIsHls = hasVideo && isHls(heroVideoUrl!);

  return (
    <section
      className={`kinetic-hero${hasVideo ? " kinetic-hero--video" : ""}`}
      aria-label="Introduction"
    >
      {hasVideo ? (
        <video
          className="kinetic-hero__video"
          data-video="hero"
          aria-hidden="true"
          muted
          playsInline
          {...(videoIsHls ? { "data-hls-src": heroVideoUrl } : {})}
        >
          {!videoIsHls && (
            <source src={heroVideoUrl} type="video/mp4" />
          )}
        </video>
      ) : (
        <div className="hero-backdrop" aria-hidden="true" />
      )}

      <div className="kinetic-hero-content">
        <span
          className="kinetic-hero-eyebrow liquid-glass animate-blur-fade-up"
          style={{ "--d": "0ms" } as React.CSSProperties}
        >
          {basics.location?.city
            ? `${basics.location.city} — design × engineering`
            : "design × engineering"}
        </span>

        <BlurTextHeading text={headlineText} />

        <p
          className="kinetic-hero-positioning animate-blur-fade-up"
          style={{ "--d": "900ms" } as React.CSSProperties}
        >
          {summary}
        </p>

        <HeroSignals basics={basics} />

        {employers.length > 0 && (
          <p
            className="kinetic-hero-employers animate-blur-fade-up"
            style={{ "--d": "1050ms" } as React.CSSProperties}
          >
            Previously at
            <span>{employers.join(" · ")}</span>
          </p>
        )}

        {anchorStat && (
          <div
            className="kinetic-anchor liquid-glass animate-blur-fade-up"
            style={{ "--d": "1150ms" } as React.CSSProperties}
          >
            <span className="kinetic-anchor-star" aria-hidden="true">✦</span>
            <strong>{anchorStat.value}</strong>
            <span>{anchorStat.unit}</span>
            {anchorStat.context && <em>— {anchorStat.context}</em>}
          </div>
        )}

        {hiring && hiring.status !== "not-looking" && (
          <div
            className="kinetic-hero-ctas animate-blur-fade-up"
            style={{ "--d": "1250ms" } as React.CSSProperties}
          >
            <a
              className="kinetic-cta"
              href={hiring.ctaHref || "/contact/"}
            >
              {hiring.ctaText ||
                (hiring.status === "available"
                  ? "Let's work together"
                  : "Open to conversations")}
              <span className="kinetic-cta-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="kinetic-cta is-ghost" href="/projects/">
              See work
            </a>
          </div>
        )}
      </div>

      {marqueeItems.length > 0 && (
        <div
          className="kinetic-partners animate-blur-fade-up"
          style={{ "--d": "1400ms" } as React.CSSProperties}
        >
          <span className="kinetic-partners-label">Trusted by teams at</span>
          <div className="marquee">
            <ul className="marquee__track">
              {marqueeItems.map((emp, i) => (
                <li key={`a-${i}-${emp}`}>{emp}</li>
              ))}
            </ul>
            <ul className="marquee__track" aria-hidden="true">
              {marqueeItems.map((emp, i) => (
                <li key={`b-${i}-${emp}`}>{emp}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
