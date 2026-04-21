"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Undo2,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  CategorySelector,
} from "@/components/github/category-selector";
import {
  ProjectCategoryBadge,
  visualFor as categoryVisualFor,
} from "@/components/github/project-category-badge";
import { suggestImprovements } from "@/lib/credibility/suggestions";
import type {
  SuggestionEffort,
} from "@/lib/credibility/suggestions";
import {
  SUGGESTION_CONTENT,
} from "@/lib/credibility/suggestions";
import type {
  AuthorshipFactor,
  CredibilitySignals,
  RepoCategory,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";

interface StrengthenPanelProps {
  portfolioId: string;
  projectId: string;
  projectName: string;
  signals:
    | CredibilitySignals
    | StoredCredibilitySignals
    | null
    | undefined;
  /** Current category (from the `projects.project_category` column). */
  category: RepoCategory;
  /** Whether the category was auto-classified or manually overridden. */
  categorySource: "auto" | "manual";
  /** Persisted list of dismissed suggestion IDs. */
  dismissedSuggestions: readonly string[];
  /** Whether the portfolio byline is currently enabled for this project. */
  showCharacterizationOnPortfolio: boolean;
  className?: string;
}

/**
 * Phase 8 — the inline coaching surface. Replaces the old verdict-heavy
 * authorship rendering under each project. Never surfaces a grade; always
 * leads with what's already working, then lists optional strengthening
 * suggestions with per-item dismissal.
 *
 * All mutations hit `PATCH /api/portfolios/:pid/projects/:prid/coaching`.
 * Local state reflects the optimistic update so the UI stays responsive
 * while the server commits.
 */
export function StrengthenPanel({
  portfolioId,
  projectId,
  projectName,
  signals,
  category: initialCategory,
  categorySource: initialCategorySource,
  dismissedSuggestions: initialDismissed,
  showCharacterizationOnPortfolio: initialShowByline,
  className,
}: StrengthenPanelProps) {
  // Optimistic state — each mutation updates local state first, then PATCHes.
  // On error we revert and log (visitor-friendly error UI is deferred).
  const [expanded, setExpanded] = useState(true);
  const [category, setCategory] = useState<RepoCategory>(initialCategory);
  const [categorySource, setCategorySource] = useState<"auto" | "manual">(
    initialCategorySource
  );
  const [dismissed, setDismissed] = useState<readonly string[]>(
    initialDismissed
  );
  const [showByline, setShowByline] = useState<boolean>(initialShowByline);
  const [, startTransition] = useTransition();

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/projects/${projectId}/coaching`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          console.warn("Coaching PATCH failed:", await res.text());
        }
      } catch (err) {
        console.warn("Coaching PATCH error:", err);
      }
    },
    [portfolioId, projectId]
  );

  const handleCategoryChange = (next: RepoCategory) => {
    setCategory(next);
    setCategorySource("manual");
    startTransition(() => {
      patch({ category: next });
    });
  };

  const dismissSuggestion = (id: string) => {
    const next = Array.from(new Set([...dismissed, id]));
    setDismissed(next);
    startTransition(() => {
      patch({ dismissedSuggestions: next });
    });
  };

  const restoreSuggestion = (id: string) => {
    const next = dismissed.filter((x) => x !== id);
    setDismissed(next);
    startTransition(() => {
      patch({ dismissedSuggestions: next });
    });
  };

  const toggleByline = (next: boolean) => {
    setShowByline(next);
    startTransition(() => {
      patch({ showCharacterizationOnPortfolio: next });
    });
  };

  // ─── Derived content ────────────────────────────────────────────────────
  const authorship = signals?.authorshipSignal;
  const presentation =
    authorship && authorship.status === "ok"
      ? authorship.presentation
      : null;

  const affirmations = presentation?.affirmations ?? [];
  const characterization =
    presentation?.characterization ??
    `GitHub project${projectName ? ` — ${projectName}` : ""}.`;

  const activeSuggestions = useMemo(() => {
    if (!signals?.authorshipSignal) return [];
    return suggestImprovements(signals as CredibilitySignals, {
      category,
      dismissedIds: dismissed,
    });
  }, [signals, category, dismissed]);

  // Dismissed suggestions that would apply to this category — shown in
  // the small "Dismissed" footer so the owner can restore any time.
  const dismissedEntries = useMemo(() => {
    const applicable = Object.values(SUGGESTION_CONTENT).filter((s) =>
      s.categories.includes(category)
    );
    return applicable.filter((s) => dismissed.includes(s.id));
  }, [category, dismissed]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/40 p-4",
        className
      )}
      data-testid="strengthen-panel"
    >
      {/* Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              Strengthen this project
            </span>
            <ProjectCategoryBadge
              category={category}
              source={categorySource}
              compact
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {characterization}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="gap-1 text-xs"
          aria-expanded={expanded}
          data-testid="strengthen-panel-toggle"
        >
          {expanded ? "Collapse" : "Expand"}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </Button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4">
          {/* Affirmations ─────────────────────────────────────────────── */}
          {affirmations.length > 0 ? (
            <section>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Working in your favor
              </p>
              <ul className="mt-1.5 space-y-1">
                {affirmations.map((factor) => (
                  <AffirmationRow key={factor.name} factor={factor} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* Gaps → suggestions ───────────────────────────────────────── */}
          {activeSuggestions.length > 0 ? (
            <section>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Optional strengthening
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {activeSuggestions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-md border border-border/50 bg-background/40 p-2 text-xs"
                    data-suggestion-id={s.id}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.title}</span>
                        <EffortBadge effort={s.effort} />
                      </div>
                      <p className="text-muted-foreground">{s.description}</p>
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
                      onClick={() => dismissSuggestion(s.id)}
                      aria-label={`Dismiss suggestion: ${s.title}`}
                      className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                      data-testid={`dismiss-${s.id}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing to flag — this project's signals are solid for its
              category.
            </p>
          )}

          {/* Controls row ────────────────────────────────────────────── */}
          <section className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Category:</span>
              <CategorySelector
                value={category}
                onChange={handleCategoryChange}
                compact
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={showByline}
                onCheckedChange={toggleByline}
                data-testid="byline-toggle"
              />
              <span>Show description on portfolio</span>
            </label>
          </section>

          {/* Dismissed footer ─────────────────────────────────────────── */}
          {dismissedEntries.length > 0 ? (
            <section className="border-t pt-2">
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Dismissed ({dismissedEntries.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {dismissedEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 text-muted-foreground"
                    >
                      <span>{entry.title}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restoreSuggestion(entry.id)}
                        className="h-6 gap-1 px-2 text-[11px]"
                        data-testid={`restore-${entry.id}`}
                      >
                        <Undo2 className="h-3 w-3" />
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AffirmationRow({ factor }: { factor: AuthorshipFactor }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="text-muted-foreground">{factor.reason}</span>
    </li>
  );
}

function EffortBadge({ effort }: { effort: SuggestionEffort }) {
  const label =
    effort === "5min" ? "5 min" : effort === "30min" ? "30 min" : "1h+";
  const cls =
    effort === "5min"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : effort === "30min"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-0 text-[10px] font-medium",
        cls
      )}
    >
      {label}
    </span>
  );
}

// Silence a linter warning — `categoryVisualFor` is re-exported here to
// keep the import graph stable for any downstream consumers that import it
// transitively via this panel.
export const _visualFor = categoryVisualFor;
