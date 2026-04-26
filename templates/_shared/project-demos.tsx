import React from "react";
import type { ProjectDemo } from "./types";
import { resolveDemo } from "@/lib/demos/platform-detect";
import { toRenderMode } from "@/lib/demos/render-mode";

interface ProjectDemosProps {
  demos: ProjectDemo[] | undefined;
  /**
   * Caption above the demo block. Defaults to "Demo" — pass null to
   * suppress the heading entirely (some templates lead with the iframe).
   */
  heading?: string | null;
}

/**
 * Phase E2 — Render the user-curated demo list inline on the published
 * site. This is the static, JS-free counterpart to the builder's live
 * `<ProjectDemo>` component.
 *
 * Render decisions follow the canonical rules in
 * `src/lib/demos/render-mode.ts`:
 *   - 0 demos → renders nothing (returns null)
 *   - 1 demo → single embed (iframe / video / image / outbound link)
 *   - 2+ image|gif → CSS-only horizontal scroll-snap slideshow
 *   - mixed types → first wins (the builder UI warns the user)
 *
 * Embed URLs come from `resolveDemo()` so YouTube / Loom / Vimeo URLs
 * become canonical embed forms (`/embed/`, `/embed/`, `/video/`). For
 * any URL whose host isn't on the allowlist, we degrade to a plain
 * outbound link rather than attempting to iframe arbitrary domains.
 */
export function ProjectDemos({ demos, heading = "Demo" }: ProjectDemosProps) {
  if (!demos || demos.length === 0) return null;

  const resolved = demos.map((d) => resolveDemo(d));
  const mode = toRenderMode(resolved);
  if (mode.kind === "none") return null;

  return (
    <section className="pwb-demos" aria-label={heading ?? "Demo"}>
      {heading && <h3 className="pwb-demos-heading">{heading}</h3>}
      {mode.kind === "single" ? (
        <DemoFrame demo={mode.demo} />
      ) : (
        <DemoSlideshow demos={mode.demos} />
      )}
    </section>
  );
}

/**
 * Render a single resolved demo. Branches on type:
 *   - youtube/loom/vimeo + valid embedUrl  → 16:9 iframe
 *   - video                                 → <video controls>
 *   - image / gif                           → <img>
 *   - other (or embed not allowlisted)      → outbound link card
 */
function DemoFrame({ demo }: { demo: ReturnType<typeof resolveDemo> }) {
  const caption = demo.oembedTitle ?? demo.title ?? null;

  if (
    (demo.type === "youtube" ||
      demo.type === "loom" ||
      demo.type === "vimeo") &&
    demo.embedUrl
  ) {
    return (
      <figure className="pwb-demo pwb-demo-iframe">
        <div className="pwb-demo-aspect">
          <iframe
            src={demo.embedUrl}
            title={caption ?? `${demo.type} demo`}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        {caption && <figcaption className="pwb-demo-caption">{caption}</figcaption>}
      </figure>
    );
  }

  if (demo.type === "video") {
    return (
      <figure className="pwb-demo pwb-demo-video">
        <video
          src={demo.url}
          poster={demo.thumbnailUrl ?? undefined}
          controls
          preload="metadata"
          playsInline
        />
        {caption && <figcaption className="pwb-demo-caption">{caption}</figcaption>}
      </figure>
    );
  }

  if (demo.type === "image" || demo.type === "gif") {
    return (
      <figure className="pwb-demo pwb-demo-image">
        <img
          src={demo.url}
          alt={caption ?? "Project demo"}
          loading="lazy"
        />
        {caption && <figcaption className="pwb-demo-caption">{caption}</figcaption>}
      </figure>
    );
  }

  // Unknown / non-allowlisted hosts — render as a card-shaped outbound
  // link so visitors can still reach the asset, but we never iframe an
  // unverified domain.
  return (
    <a
      className="pwb-demo pwb-demo-link"
      href={demo.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="pwb-demo-link-label">{caption ?? "View demo"}</span>
      <span className="pwb-demo-link-url">{demo.url}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

/**
 * Multi-image slideshow. Pure CSS — a horizontal flex container with
 * `scroll-snap-type: x mandatory` on the scroller and `scroll-snap-align:
 * center` on each slide. Visitors swipe (touch) or arrow-key (keyboard
 * focus). Zero JS dependency. The visible-without-JS state is "scrollable
 * horizontal strip of images."
 */
function DemoSlideshow({
  demos,
}: {
  demos: Array<ReturnType<typeof resolveDemo>>;
}) {
  return (
    <div
      className="pwb-demo-slideshow"
      role="region"
      aria-roledescription="carousel"
      aria-label="Project images"
      tabIndex={0}
    >
      {demos.map((d, i) => {
        const caption = d.oembedTitle ?? d.title ?? null;
        return (
          <figure className="pwb-demo-slide" key={d.id}>
            <img
              src={d.url}
              alt={caption ?? `Slide ${i + 1} of ${demos.length}`}
              loading={i === 0 ? "eager" : "lazy"}
            />
            {caption && (
              <figcaption className="pwb-demo-caption">{caption}</figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
