"use client";

import {
  BookOpen,
  Wrench,
  Globe2,
  Users2,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RepoCategory } from "@/lib/credibility/types";

interface ProjectCategoryBadgeProps {
  category: RepoCategory | null | undefined;
  /**
   * Source of the category — `auto` (classifier picked it) or `manual`
   * (owner overrode). Tooltip surfaces this subtly so the owner knows
   * they can change it.
   */
  source?: "auto" | "manual";
  /** Compact variant for repo cards (no label subtext). */
  compact?: boolean;
  className?: string;
}

/**
 * Phase 8 — informational badge replacing the old authorship verdict chip.
 *
 * This is *characterization*, not a grade. The badge simply names the kind
 * of project we're looking at so coaching signals + portfolio presentation
 * can be framed correctly. No "mixed signals" or "N of 6 positive" language.
 *
 * Returns `null` when the category is `unspecified` (or falsy) and `compact`
 * is true — the repo card stays clean when we have no opinion. In non-
 * compact contexts we render the `unspecified` pill so the owner can still
 * open the category selector.
 */
export function ProjectCategoryBadge({
  category,
  source,
  compact = false,
  className,
}: ProjectCategoryBadgeProps) {
  const resolved = category ?? "unspecified";
  if (compact && resolved === "unspecified") return null;

  const visual = visualFor(resolved);
  const Icon = visual.Icon;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
              visual.chipClass,
              className
            )}
            data-testid="project-category-badge"
            data-category={resolved}
            aria-label={`Category: ${visual.label}`}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            <span>{visual.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" sideOffset={6}>
          <div className="space-y-1 text-xs">
            <p className="font-semibold">{visual.label}</p>
            <p className="text-muted-foreground">{visual.description}</p>
            {source ? (
              <p className="text-muted-foreground/70">
                {source === "auto"
                  ? "Auto-detected from repo signals. You can change this."
                  : "Manually set by you."}
              </p>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Visual mapping ─────────────────────────────────────────────────────────

interface CategoryVisual {
  label: string;
  description: string;
  Icon: LucideIcon;
  chipClass: string;
}

export function visualFor(category: RepoCategory): CategoryVisual {
  switch (category) {
    case "personal_learning":
      return {
        label: "Personal · Learning",
        description:
          "A solo repo built to explore something — coached on what the work itself reveals, not on team-project signals.",
        Icon: BookOpen,
        chipClass:
          "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "personal_tool":
      return {
        label: "Personal · Tool",
        description:
          "A sustained solo side project. Coached on cadence, docs, and deploy signals.",
        Icon: Wrench,
        chipClass:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "oss_author":
      return {
        label: "OSS · Author",
        description:
          "A project you started and that has public traction. The full rubric applies.",
        Icon: Globe2,
        chipClass:
          "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    case "oss_contributor":
      return {
        label: "OSS · Contributor",
        description:
          "Someone else's repo you contributed to. Coaching looks at your fingerprint, not the whole repo's health.",
        Icon: Users2,
        chipClass:
          "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
      };
    case "unspecified":
    default:
      return {
        label: "Uncategorized",
        description:
          "We haven't classified this repo yet. Pick a category to get focused coaching.",
        Icon: HelpCircle,
        chipClass:
          "border-border bg-muted text-muted-foreground",
      };
  }
}
