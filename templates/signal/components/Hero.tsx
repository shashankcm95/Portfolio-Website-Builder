import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { HeroSignals } from "@/templates/_shared/hero-signals";

interface HeroProps {
  basics: ProfileData["basics"];
}

/**
 * The top-of-content hero block on the home page (not the rail).
 *
 * The layered claim hierarchy mirrors what the strongest portfolios do:
 *   1. `anchorStat` pill — "✦ 4k+ GitHub stars" — the single strongest
 *      credential, surfaced first. Skipped silently when Phase B's
 *      derivation found no candidate.
 *   2. `namedEmployers` eyebrow — "Previously at Apple, Klaviyo". Skipped
 *      when empty.
 *   3. `summary` — the bio paragraph. Capped at ~56ch via CSS.
 *   4. Hiring CTA — button only when `hiring.status === "available"`, or
 *      a muted variant when "open".
 */
function isHls(url: string): boolean {
  return /\.m3u8(\?.*)?$/i.test(url);
}

export function Hero({ basics }: HeroProps) {
  const {
    anchorStat,
    namedEmployers,
    summary,
    hiring,
    heroVideoUrl,
    heroBackgroundEffect,
  } = basics;
  const hasVideo = Boolean(heroVideoUrl);
  const videoIsHls = hasVideo && isHls(heroVideoUrl!);
  // R7 — apply the named effect class only when no video is set; the
  // video takes over the backdrop entirely. "drift" maps to the bare
  // .hero (no extra class) since that's the default look.
  const fxClass =
    !hasVideo && heroBackgroundEffect && heroBackgroundEffect !== "drift"
      ? ` hero-fx-${heroBackgroundEffect}`
      : "";

  return (
    <section
      className={`hero${hasVideo ? " hero--video" : ""}${fxClass}`}
      aria-label="Introduction"
    >
      {/* R7 — when basics.heroVideoUrl is set, the animated CSS backdrop
          is replaced by a real <video data-video="hero">. enhance.js wires
          §2.4 rAF fade + §2.5 HLS bootstrap; Layout conditionally loads
          /scripts/hls.min.js for .m3u8 sources. When unset, the
          .hero::before CSS gradient renders unchanged. */}
      {hasVideo && (
        <video
          className="hero__video"
          data-video="hero"
          aria-hidden="true"
          muted
          playsInline
          {...(videoIsHls ? { "data-hls-src": heroVideoUrl } : {})}
        >
          {!videoIsHls && <source src={heroVideoUrl} type="video/mp4" />}
        </video>
      )}

      {/* §2.1 liquid-glass + §2.2 blurFadeUp — first element, no delay */}
      {anchorStat && (
        <div
          className="hero-anchor liquid-glass animate-blur-fade-up"
          style={{ "--d": "0ms" } as React.CSSProperties}
        >
          <span className="hero-anchor-star" aria-hidden="true">✦</span>
          <strong>{anchorStat.value}</strong>
          <span>{anchorStat.unit}</span>
          {anchorStat.context && <em>— {anchorStat.context}</em>}
        </div>
      )}

      {/* §2.2 blurFadeUp — stagger 120ms apart */}
      {namedEmployers && namedEmployers.length > 0 && (
        <p
          className="hero-employers animate-blur-fade-up"
          style={{ "--d": "120ms" } as React.CSSProperties}
        >
          Previously at <span>{namedEmployers.join(" · ")}</span>
        </p>
      )}

      {/* Phase E8b — Tier-1 universal recruiter signals. */}
      <HeroSignals basics={basics} />

      <p
        className="hero-summary animate-blur-fade-up"
        style={{ "--d": "240ms" } as React.CSSProperties}
      >
        {summary}
      </p>

      {hiring && (
        <a
          className={`hero-cta animate-blur-fade-up ${hiring.status === "open" ? "is-open" : ""}`}
          href={hiring.ctaHref || "/contact/"}
          style={{ "--d": "360ms" } as React.CSSProperties}
        >
          {hiring.ctaText ||
            (hiring.status === "available"
              ? "Available for work — let's talk"
              : "Open to conversations")}
        </a>
      )}
    </section>
  );
}
