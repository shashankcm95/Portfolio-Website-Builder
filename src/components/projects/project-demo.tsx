"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DemoEmbed } from "@/components/projects/demo-embed";
import { SlideshowEmbed } from "@/components/projects/slideshow-embed";
import { resolveDemo } from "@/lib/demos/platform-detect";
import { toRenderMode } from "@/lib/demos/render-mode";
import type { ProjectDemo as ProjectDemoModel } from "@/lib/demos/types";

interface ProjectDemoProps {
  demos: ProjectDemoModel[];
  /** Optional umbrella title shown above the embed (e.g. the dev's caption). */
  title?: string | null;
  className?: string;
}

/**
 * Top-level demo renderer — takes a project's persisted demo list,
 * resolves each to its embed URL, and delegates to `<DemoEmbed>` or
 * `<SlideshowEmbed>` based on the shared {@link toRenderMode} decision
 * tree. Returns `null` when there are no demos; callers can render their
 * own empty state above.
 */
export function ProjectDemo({ demos, title, className }: ProjectDemoProps) {
  const renderMode = useMemo(() => {
    return toRenderMode(demos.map(resolveDemo));
  }, [demos]);

  if (renderMode.kind === "none") return null;

  return (
    <div
      className={cn("w-full", className)}
      data-testid="project-demo"
      data-render-mode={renderMode.kind}
    >
      {title && (
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {title}
        </p>
      )}
      {renderMode.kind === "single" ? (
        <DemoEmbed demo={renderMode.demo} />
      ) : (
        <SlideshowEmbed demos={renderMode.demos} title={title ?? null} />
      )}
    </div>
  );
}
