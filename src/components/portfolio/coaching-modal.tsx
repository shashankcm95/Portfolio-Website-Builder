"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aggregateSuggestions } from "@/lib/credibility/suggestions";
import type {
  AggregatedSuggestion,
  SuggestionEffort,
} from "@/lib/credibility/suggestions";
import type {
  CredibilitySignals,
  RepoCategory,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";

interface CoachingProject {
  id: string;
  name: string;
  signals:
    | CredibilitySignals
    | StoredCredibilitySignals
    | null
    | undefined;
  category: RepoCategory;
  dismissedSuggestions: readonly string[];
}

interface CoachingModalProps {
  portfolioId: string;
  projects: readonly CoachingProject[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful dismiss so the parent can refresh state. */
  onDismissed?: () => void;
}

/**
 * Phase 8 — aggregate coaching view.
 *
 * The inline StrengthenPanel shows per-project suggestions in context. This
 * modal flattens them into one effort-sorted list so a developer with an
 * hour to spare can see "every 5-minute win across my portfolio" at a
 * glance. Each row dismisses via the same `/coaching` PATCH endpoint.
 *
 * Only projects with an `authorshipSignal` of `status === "ok"` contribute
 * suggestions — missing/failed signal bundles are silently skipped.
 */
export function CoachingModal({
  portfolioId,
  projects,
  open,
  onOpenChange,
  onDismissed,
}: CoachingModalProps) {
  const [optimisticDismissed, setOptimisticDismissed] = useState<
    Record<string, ReadonlySet<string>>
  >({});
  const [, startTransition] = useTransition();

  // Compute the flattened list on every render — the aggregator is cheap
  // (O(projects × factors)) and keeping this pure lets optimistic
  // dismissals take effect instantly.
  const suggestions = useMemo<AggregatedSuggestion[]>(() => {
    const inputs = projects
      .filter(
        (p) =>
          p.signals?.authorshipSignal &&
          p.signals.authorshipSignal.status === "ok"
      )
      .map((p) => ({
        projectId: p.id,
        projectName: p.name,
        signals: p.signals as CredibilitySignals,
        category: p.category,
        dismissedIds: mergeDismissed(
          p.dismissedSuggestions,
          optimisticDismissed[p.id]
        ),
      }));
    return aggregateSuggestions(inputs);
  }, [projects, optimisticDismissed]);

  const dismiss = async (projectId: string, suggestionId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const merged = Array.from(
      mergeDismissed(project.dismissedSuggestions, optimisticDismissed[projectId])
    );
    if (!merged.includes(suggestionId)) merged.push(suggestionId);

    setOptimisticDismissed((prev) => ({
      ...prev,
      [projectId]: new Set(merged),
    }));

    startTransition(async () => {
      try {
        await fetch(
          `/api/portfolios/${portfolioId}/projects/${projectId}/coaching`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dismissedSuggestions: merged }),
          }
        );
        onDismissed?.();
      } catch (err) {
        console.warn("Coaching dismiss failed:", err);
      }
    });
  };

  // Group by effort bucket for visual separation in the modal.
  const byEffort: Record<SuggestionEffort, AggregatedSuggestion[]> = {
    "5min": [],
    "30min": [],
    "1h+": [],
  };
  for (const s of suggestions) byEffort[s.effort].push(s);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Strengthen your portfolio
          </DialogTitle>
          <DialogDescription>
            {suggestions.length === 0
              ? "No open suggestions — everything is working in your favor."
              : `${suggestions.length} optional strengthening task${suggestions.length === 1 ? "" : "s"} across your projects, sorted by time to complete.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1">
          {(["5min", "30min", "1h+"] as const).map((bucket) => {
            const rows = byEffort[bucket];
            if (rows.length === 0) return null;
            return (
              <section key={bucket} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {bucket === "5min"
                    ? "Quick wins (5 min)"
                    : bucket === "30min"
                      ? "Short tasks (30 min)"
                      : "Longer-term (1h+)"}
                </h3>
                <ul className="space-y-2">
                  {rows.map((s) => (
                    <li
                      key={`${s.projectId}:${s.id}`}
                      className={cn(
                        "rounded-md border border-border/50 bg-card/40 p-3",
                        "flex items-start gap-3 text-sm"
                      )}
                      data-suggestion-id={s.id}
                      data-project-id={s.projectId}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.title}</span>
                          <Link
                            href={`/portfolios/${portfolioId}/projects/${s.projectId}`}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {s.projectName}
                          </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.description}
                        </p>
                        {s.helpUrl ? (
                          <a
                            href={s.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Read the docs
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismiss(s.projectId, s.id)}
                        aria-label={`Dismiss suggestion: ${s.title}`}
                        className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mergeDismissed(
  persisted: readonly string[],
  optimistic: ReadonlySet<string> | undefined
): readonly string[] {
  if (!optimistic) return persisted;
  const out = new Set<string>(persisted);
  for (const id of optimistic) out.add(id);
  return Array.from(out);
}
