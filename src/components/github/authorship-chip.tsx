"use client";

import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  AuthorshipFactor,
  AuthorshipSignal,
  AuthorshipVerdict,
} from "@/lib/credibility/types";

interface AuthorshipChipProps {
  signal: AuthorshipSignal | null | undefined;
  /**
   * Compact = single pill with verdict + popover for factors (card view).
   * Default = full Authorship section showing every factor in a list.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Renders the Phase 2 authorship verdict. Returns `null` when the signal
 * is absent (v1 row) or `status: "missing"` — we don't show anything when
 * we can't meaningfully score.
 */
export function AuthorshipChip({
  signal,
  compact = false,
  className,
}: AuthorshipChipProps) {
  if (!signal || signal.status !== "ok") return null;

  return compact ? (
    <CompactChip signal={signal} className={className} />
  ) : (
    <FullSection signal={signal} className={className} />
  );
}

// ─── Compact pill + popover ─────────────────────────────────────────────────

function CompactChip({
  signal,
  className,
}: {
  signal: Extract<AuthorshipSignal, { status: "ok" }>;
  className?: string;
}) {
  const visual = visualFor(signal.verdict);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              visual.chipClass,
              className
            )}
            aria-label={`Authorship: ${visual.label}. ${signal.positiveCount} of ${signal.factors.length} factors positive.`}
            data-testid="authorship-chip-compact"
          >
            <visual.Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{visual.label}</span>
            <span className="text-muted-foreground/80">
              · {signal.positiveCount}/{signal.factors.length}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" sideOffset={6}>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">
              Why: {signal.positiveCount}/{signal.factors.length} factors positive
            </p>
            <ul className="space-y-1">
              {signal.factors.map((f) => (
                <li key={f.name} className="flex items-start gap-1.5 text-xs">
                  <FactorIcon verdict={f.verdict} />
                  <span className="text-muted-foreground">{f.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Full layout (detail page) ──────────────────────────────────────────────

function FullSection({
  signal,
  className,
}: {
  signal: Extract<AuthorshipSignal, { status: "ok" }>;
  className?: string;
}) {
  const visual = visualFor(signal.verdict);
  return (
    <div
      className={cn("space-y-3", className)}
      data-testid="authorship-chip-full"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
            visual.chipClass
          )}
        >
          <visual.Icon className="h-4 w-4" aria-hidden />
          {visual.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {signal.positiveCount} of {signal.factors.length} factors positive
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {signal.factors.map((f) => (
          <li key={f.name} className="flex items-start gap-2">
            <FactorIcon verdict={f.verdict} />
            <span>
              <span className="font-medium capitalize">
                {humanFactorName(f.name)}:
              </span>{" "}
              <span className="text-muted-foreground">{f.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function visualFor(v: AuthorshipVerdict) {
  switch (v) {
    case "sustained":
      return {
        label: "Sustained development",
        Icon: Sparkles,
        chipClass:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "mixed":
      return {
        label: "Mixed signals",
        Icon: AlertTriangle,
        chipClass:
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "single-burst":
      return {
        label: "Single-burst repo",
        Icon: AlertCircle,
        chipClass:
          "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
      };
  }
}

function FactorIcon({
  verdict,
}: {
  verdict: AuthorshipFactor["verdict"];
}) {
  if (verdict === "positive")
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (verdict === "neutral")
    return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
}

function humanFactorName(name: AuthorshipFactor["name"]): string {
  const map: Record<AuthorshipFactor["name"], string> = {
    commitDays: "Commit cadence",
    messageQuality: "Commit messages",
    collaboration: "Collaboration",
    releases: "Releases",
    externalPresence: "External presence",
    ageVsPush: "Age & recency",
  };
  return map[name];
}
