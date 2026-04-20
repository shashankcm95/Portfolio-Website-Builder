/**
 * The SINGLE source of truth for "given a project's demo list, what does
 * the UI render?". UI components (ProjectDemo, ProjectThumbnail), the
 * storyboard merger, and the repo-card thumbnail all read through this
 * one helper — so rendering logic can never drift between consumers.
 *
 * Rules:
 *   - 0 demos                        → `{ kind: "none" }`
 *   - 1 demo                         → `{ kind: "single", demo }`
 *   - 2+ demos, all image|gif type   → `{ kind: "slideshow", demos }`
 *   - 2+ demos, mixed types          → `{ kind: "single", demo: first }`
 *                                      (UI should warn the developer)
 */

import type { DemoRenderMode, ResolvedDemo } from "@/lib/demos/types";

const SLIDESHOW_TYPES = new Set(["image", "gif"] as const);

export function toRenderMode(demos: ResolvedDemo[]): DemoRenderMode {
  if (demos.length === 0) {
    return { kind: "none" };
  }

  if (demos.length === 1) {
    return { kind: "single", demo: demos[0] };
  }

  const allSlideshowable = demos.every((d) =>
    SLIDESHOW_TYPES.has(d.type as never)
  );

  if (allSlideshowable) {
    return { kind: "slideshow", demos };
  }

  // Mixed list — first wins; the UI is responsible for surfacing a warning.
  return { kind: "single", demo: demos[0] };
}

/**
 * Convenience for the `<DemoForm>` mixed-type warning: returns `true` when
 * the list has 2+ demos AND at least one item is not slideshow-compatible.
 * Intended for client-side preview on the input rows, not for routing
 * decisions (use `toRenderMode` for those).
 */
export function hasMixedSlideshowTypes(demos: ResolvedDemo[]): boolean {
  if (demos.length < 2) return false;
  return !demos.every((d) => SLIDESHOW_TYPES.has(d.type as never));
}
