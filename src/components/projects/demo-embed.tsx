"use client";

import { useState } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedDemo } from "@/lib/demos/types";

interface DemoEmbedProps {
  demo: ResolvedDemo;
  className?: string;
}

/**
 * Renders a single {@link ResolvedDemo}. Branches on `type`:
 *   - youtube / loom / vimeo → sandboxed `<iframe>` (only when embedUrl is
 *     in the host allowlist computed by `resolveDemo`; else link-out).
 *   - video → native `<video>` with controls; poster is the still frame.
 *   - image / gif → native `<img>` with lazy loading.
 *   - other → bordered outbound-link box.
 *
 * On any `onError` we fall through to a "broken media — open in new tab"
 * card rather than rendering a blank element. Iframe failures can't be
 * detected without cross-origin access so those don't trigger fallback.
 */
export function DemoEmbed({ demo, className }: DemoEmbedProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <BrokenMedia url={demo.url} title={demo.title} />;

  // Iframe branch — only when we have a normalized embedUrl AND the host
  // passed the allowlist inside resolveDemo. Otherwise fall through to the
  // outbound link.
  if (
    (demo.type === "youtube" ||
      demo.type === "loom" ||
      demo.type === "vimeo") &&
    demo.embedUrl
  ) {
    return (
      <div
        className={cn(
          "aspect-video w-full overflow-hidden rounded-md border",
          className
        )}
        data-testid="demo-embed-iframe"
        data-demo-type={demo.type}
      >
        <iframe
          src={demo.embedUrl}
          title={demo.title ?? `${demo.type} demo`}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className="h-full w-full"
        />
      </div>
    );
  }

  if (demo.type === "video") {
    return (
      <video
        controls
        preload="metadata"
        playsInline
        onError={() => setFailed(true)}
        className={cn(
          "aspect-video w-full rounded-md border bg-black",
          className
        )}
        data-testid="demo-embed-video"
      >
        <source src={demo.url} />
      </video>
    );
  }

  if (demo.type === "image" || demo.type === "gif") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- intentional: user-supplied CDN URLs
      <img
        src={demo.url}
        alt={demo.title ?? "Project demo"}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn(
          "aspect-video w-full rounded-md border object-cover",
          className
        )}
        data-testid="demo-embed-image"
        data-demo-type={demo.type}
      />
    );
  }

  // "other" — always render as outbound link, NEVER as iframe
  return (
    <a
      href={demo.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex aspect-video w-full items-center justify-center gap-2 rounded-md border bg-muted/30 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
        className
      )}
      data-testid="demo-embed-link"
    >
      <ExternalLink className="h-4 w-4" />
      {demo.title ?? "Open demo"}
    </a>
  );
}

// ─── Fallback when media fails to load ──────────────────────────────────────

function BrokenMedia({
  url,
  title,
}: {
  url: string;
  title: string | null;
}) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-center text-xs text-amber-900 dark:text-amber-200"
      data-testid="demo-embed-broken"
    >
      <AlertCircle className="h-5 w-5" aria-hidden />
      <p>Couldn&apos;t load {title ?? "this demo"}.</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium underline"
      >
        <ExternalLink className="h-3 w-3" />
        Open in new tab
      </a>
    </div>
  );
}
