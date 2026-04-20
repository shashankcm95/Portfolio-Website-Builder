"use client";

import { useState } from "react";
import { ArrowRight, ExternalLink, Sparkles, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AskAssistantDialog } from "@/components/chatbot/ask-assistant-dialog";
import { cn } from "@/lib/utils";
import { suggestImprovements } from "@/lib/credibility/suggestions";
import type {
  CredibilitySignals,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";
import type {
  SuggestionImpact,
  Suggestion,
} from "@/lib/credibility/suggestions";

interface ImprovementSuggestionsProps {
  // Accept reader type so v1 rows no-op cleanly (authorshipSignal undefined).
  signals:
    | CredibilitySignals
    | StoredCredibilitySignals
    | null
    | undefined;
  /**
   * Phase 5.2 — required to wire the Ask Assistant dialog. When omitted,
   * the button falls back to the disabled stub (prevents breaking any
   * legacy callers that didn't get threaded through).
   */
  portfolioId?: string;
  className?: string;
}

/**
 * Deterministic improvement suggestions based on the authorship score.
 * Pure UI — computes the list on render via `suggestImprovements`.
 *
 * Returns `null` when there are no actionable suggestions (green repo) or
 * the signal is missing — nothing to show, keep the page clean.
 *
 * Each row has an "Ask the assistant" button wired to the Phase 5.2
 * streaming chat dialog (when `portfolioId` is provided).
 */
export function ImprovementSuggestions({
  signals,
  portfolioId,
  className,
}: ImprovementSuggestionsProps) {
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(
    null
  );

  if (!signals) return null;
  // Guard: v1 rows have no authorshipSignal → no suggestions to surface.
  if (!signals.authorshipSignal) return null;
  const suggestions = suggestImprovements(signals as CredibilitySignals);
  if (suggestions.length === 0) return null;

  return (
    <div
      className={cn("space-y-3", className)}
      data-testid="improvement-suggestions"
    >
      <p className="text-sm text-muted-foreground">
        <Sparkles className="mr-1 inline h-3.5 w-3.5" />
        {suggestions.length} way{suggestions.length === 1 ? "" : "s"} to strengthen this project's authorship signal.
      </p>
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border bg-card/50 p-3"
            data-suggestion-id={s.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.title}</span>
                  <ImpactBadge impact={s.impact} />
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                {s.helpUrl && (
                  <a
                    href={s.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Read the docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <AskAssistantButton
                suggestion={s}
                portfolioId={portfolioId}
                onClick={() => setActiveSuggestion(s)}
              />
            </div>
          </li>
        ))}
      </ul>

      {portfolioId && activeSuggestion && (
        <AskAssistantDialog
          open={true}
          onOpenChange={(next) => {
            if (!next) setActiveSuggestion(null);
          }}
          portfolioId={portfolioId}
          suggestion={activeSuggestion}
        />
      )}
    </div>
  );
}

// ─── Impact badge ───────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: SuggestionImpact }) {
  const label =
    impact === "negative-to-positive"
      ? "+1 positive factor"
      : impact === "negative-to-neutral"
        ? "moves out of negative"
        : "neutral → positive";
  const cls =
    impact === "negative-to-positive"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : impact === "negative-to-neutral"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

// ─── Ask-the-assistant button ───────────────────────────────────────────────

function AskAssistantButton({
  suggestion,
  portfolioId,
  onClick,
}: {
  suggestion: Suggestion;
  portfolioId: string | undefined;
  onClick: () => void;
}) {
  if (!portfolioId) {
    // Graceful degradation: callers who didn't thread portfolioId get
    // the old disabled stub.
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="pointer-events-none gap-1 text-xs"
                data-testid={`ask-assistant-${suggestion.id}`}
                aria-disabled="true"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Ask the assistant
                <ArrowRight className="h-3 w-3" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent sideOffset={6} className="text-xs">
            Ask Assistant requires portfolio context.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-1 text-xs"
      data-testid={`ask-assistant-${suggestion.id}`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Ask the assistant
      <ArrowRight className="h-3 w-3" />
    </Button>
  );
}
