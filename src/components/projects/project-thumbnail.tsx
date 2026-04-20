"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveDemo } from "@/lib/demos/platform-detect";
import type { ProjectDemo } from "@/lib/demos/types";

interface ProjectThumbnailProps {
  /** Manual project hero image (Wave 3B column `projects.image_url`). */
  imageUrl?: string | null;
  /** Ordered demo list; first demo is used as the thumbnail source. */
  demos?: ProjectDemo[] | null;
  className?: string;
}

/**
 * 16:9 banner shown at the top of a repo card. Source priority:
 *   1. `imageUrl` (manual project hero)            ← Wave-3B fix.
 *   2. First demo's derived thumbnail:
 *      - image / gif           → direct <img>
 *      - video                 → <video preload="metadata" muted> still frame
 *      - youtube               → img.youtube.com/vi/VIDEO_ID/hqdefault.jpg
 *      - loom / vimeo          → typed placeholder tile (no free thumbnail)
 *      - other                 → nothing
 *   3. Nothing if neither source exists — caller's card renders unchanged.
 *
 * Broken image → fall through to `null` rather than show a torn element.
 */
export function ProjectThumbnail({
  imageUrl,
  demos,
  className,
}: ProjectThumbnailProps) {
  const [broken, setBroken] = useState(false);

  // Priority 1: manual project hero image
  if (imageUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn(
          "aspect-video w-full rounded-t-lg object-cover",
          className
        )}
        data-testid="project-thumbnail"
        data-source="image-url"
      />
    );
  }

  // Priority 2: derive from first demo
  const first = demos && demos.length > 0 ? resolveDemo(demos[0]) : null;
  if (!first) return null;

  if (broken) return null; // second chance exhausted; hide rather than show torn UI

  if (first.type === "image" || first.type === "gif") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={first.url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn(
          "aspect-video w-full rounded-t-lg object-cover",
          className
        )}
        data-testid="project-thumbnail"
        data-source="demo-image"
      />
    );
  }

  if (first.type === "video") {
    return (
      <video
        src={first.url}
        muted
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
        className={cn(
          "aspect-video w-full rounded-t-lg bg-black object-cover",
          className
        )}
        data-testid="project-thumbnail"
        data-source="demo-video"
      />
    );
  }

  if (first.type === "youtube") {
    // Prefer the oEmbed-cached thumbnail (higher-res, e.g. maxresdefault)
    // else fall back to the deterministic `hqdefault.jpg` — no API call.
    const videoId = extractYoutubeId(first.url);
    const src =
      first.thumbnailUrl ??
      (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn(
          "aspect-video w-full rounded-t-lg object-cover",
          className
        )}
        data-testid="project-thumbnail"
        data-source="youtube"
      />
    );
  }

  if (first.type === "loom" || first.type === "vimeo") {
    // Phase 4.2 — when the oEmbed enrichment has populated a thumbnail,
    // render it with an onError fallback to the typed placeholder. Until
    // enrichment lands (or if the provider never returned a thumbnail),
    // the placeholder tile keeps the card's visual anchor.
    if (first.thumbnailUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={first.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={cn(
            "aspect-video w-full rounded-t-lg object-cover",
            className
          )}
          data-testid="project-thumbnail"
          data-source={first.type}
        />
      );
    }
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center gap-1.5 rounded-t-lg bg-muted text-xs text-muted-foreground",
          className
        )}
        data-testid="project-thumbnail"
        data-source={first.type}
      >
        <Play className="h-4 w-4" />
        {first.type === "loom" ? "Loom video" : "Vimeo video"}
      </div>
    );
  }

  // "other" → no thumbnail
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i
  );
  return match ? match[1] : null;
}
