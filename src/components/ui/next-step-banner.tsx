"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NextStepBannerProps {
  /** Short headline, e.g. "Resume parsed!" or "Step 2 of 3" */
  title: string;
  /** Explanatory subtext, e.g. "Next: create your first portfolio." */
  description?: string;
  /** CTA label */
  cta: string;
  /** CTA target — either an internal route or a button handler */
  href?: string;
  onCtaClick?: () => void;
  /** Visual tone. "success" = green-ish (after an action); "info" = blue (prompt) */
  tone?: "success" | "info";
  className?: string;
}

/**
 * Shared "you-did-X-next-is-Y" banner used at every pipeline milestone.
 *
 * Personas like Priya (fast-track new grad) drop off at milestone transitions
 * when the next action isn't obvious — this component makes it explicit.
 */
export function NextStepBanner({
  title,
  description,
  cta,
  href,
  onCtaClick,
  tone = "info",
  className,
}: NextStepBannerProps) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
      : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30";

  const iconColor =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-blue-600 dark:text-blue-400";

  const titleColor =
    tone === "success"
      ? "text-emerald-900 dark:text-emerald-100"
      : "text-blue-900 dark:text-blue-100";

  const descColor =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-blue-700 dark:text-blue-300";

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between",
        toneClasses,
        className
      )}
      data-testid="next-step-banner"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor)} />
        <div>
          <p className={cn("text-sm font-semibold", titleColor)}>{title}</p>
          {description && (
            <p className={cn("mt-0.5 text-sm", descColor)}>{description}</p>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {href ? (
          <Button asChild size="sm">
            <Link href={href}>
              {cta}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={onCtaClick}>
            {cta}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
