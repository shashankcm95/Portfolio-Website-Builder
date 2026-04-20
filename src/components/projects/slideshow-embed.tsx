"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SLIDESHOW_ADVANCE_MS, type ResolvedDemo } from "@/lib/demos/types";

interface SlideshowEmbedProps {
  /** All demos MUST be of type image or gif; this is enforced by `toRenderMode`. */
  demos: ResolvedDemo[];
  /** Optional umbrella title for the whole slideshow (e.g. "Product tour"). */
  title?: string | null;
  className?: string;
}

/**
 * Auto-advancing carousel of image/GIF demos.
 *
 * - Advances every {@link SLIDESHOW_ADVANCE_MS} ms.
 * - Pauses on hover or keyboard focus; resumes on exit.
 * - Arrow keys navigate when focused; dot indicators work as click targets.
 * - Accessible: `role="region"`, `aria-roledescription="carousel"`,
 *   `aria-live="polite"` on the slide area, per-slide `aria-label`.
 * - Broken image per slide hides that one slide without breaking navigation.
 */
export function SlideshowEmbed({
  demos,
  title,
  className,
}: SlideshowEmbedProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [brokenSet, setBrokenSet] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const total = demos.length;

  const advance = useCallback(
    (delta: 1 | -1) => {
      setIndex((i) => {
        if (total === 0) return 0;
        return (i + delta + total) % total;
      });
    },
    [total]
  );

  // Auto-advance timer
  useEffect(() => {
    if (paused || total <= 1) return;
    const id = setInterval(() => advance(1), SLIDESHOW_ADVANCE_MS);
    return () => clearInterval(id);
  }, [advance, paused, total]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        advance(-1);
      }
    },
    [advance]
  );

  const markBroken = useCallback((id: string) => {
    setBrokenSet((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const ariaLabel = useMemo(() => {
    const base = title ?? "Project slideshow";
    return total > 0 ? `${base} — slide ${index + 1} of ${total}` : base;
  }, [title, index, total]);

  if (total === 0) return null;

  const current = demos[index];
  const isBroken = brokenSet.has(current.id);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-md border bg-black",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        className
      )}
      data-testid="slideshow-embed"
      data-paused={paused}
      data-current-index={index}
    >
      {/* Slide area */}
      <div aria-live="polite" className="relative h-full w-full">
        {isBroken ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Couldn&apos;t load this slide
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied CDN URLs
          <img
            key={current.id}
            src={current.url}
            alt={current.title ?? `Slide ${index + 1}`}
            loading="lazy"
            decoding="async"
            onError={() => markBroken(current.id)}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Arrow controls — only when more than one slide */}
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={(e) => {
              e.stopPropagation();
              advance(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-background"
            data-testid="slideshow-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={(e) => {
              e.stopPropagation();
              advance(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-background"
            data-testid="slideshow-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Dot indicators */}
          <div
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-background/50 px-1.5 py-1"
            data-testid="slideshow-indicators"
          >
            {demos.map((d, i) => (
              <button
                key={d.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i === index
                    ? "bg-foreground"
                    : "bg-muted-foreground/50 hover:bg-muted-foreground"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
