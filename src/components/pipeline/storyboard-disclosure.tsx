"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoryboardDisclosureProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Collapsed wrapper for the legacy long-form narrative. Uses native
 * `<details>` for zero-dep accessibility and keyboard support. Phase 3
 * promotes the storyboard as primary; this disclosure keeps the full
 * 10-section narrative available for readers who want depth.
 */
export function StoryboardDisclosure({
  title = "Read the full narrative (10 sections)",
  description = "Detailed written sections — same facts as the Guided Tour, in prose form.",
  children,
  className,
}: StoryboardDisclosureProps) {
  return (
    <details
      className={cn(
        "group rounded-lg border bg-card",
        "[&[open]]:shadow-sm",
        className
      )}
      data-testid="storyboard-disclosure"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 transition-colors hover:bg-muted/50">
        <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}
