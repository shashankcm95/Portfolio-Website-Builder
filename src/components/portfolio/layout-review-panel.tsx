"use client";

/**
 * Phase 7 — Layout review panel.
 *
 * Renders inside the portfolio detail page's Preview tab, below the
 * `<PreviewPanel>` iframe. Owner clicks "Run layout review" → POSTs
 * to `/api/portfolios/:id/layout-review`, displays the issue list +
 * composite score on completion.
 *
 * Tier 3 (AI vision review) is opt-in via a checkbox visible only
 * when `NEXT_PUBLIC_LAYOUT_REVIEW_AI_ENABLED=1` is set at build time.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { groupBySeverity, scoreBand } from "@/lib/review/scoring";
import type { LayoutIssue, LayoutReviewSummary } from "@/lib/review/types";

interface LayoutReviewPanelProps {
  portfolioId: string;
}

const AI_ENABLED =
  typeof process !== "undefined" &&
  process.env?.NEXT_PUBLIC_LAYOUT_REVIEW_AI_ENABLED === "1";

export function LayoutReviewPanel({ portfolioId }: LayoutReviewPanelProps) {
  const [review, setReview] = useState<LayoutReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableAi, setEnableAi] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/layout-review`
      );
      if (!res.ok) {
        setReview(null);
        return;
      }
      const data = (await res.json()) as { review: LayoutReviewSummary | null };
      setReview(data.review);
    } catch {
      setError("Couldn't load the latest review.");
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  const triggerRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/layout-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enableAiTier: AI_ENABLED && enableAi }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Review failed");
        return;
      }
      const data = (await res.json()) as { review: LayoutReviewSummary };
      setReview(data.review);
    } catch {
      setError("Network error.");
    } finally {
      setRunning(false);
    }
  }, [portfolioId, enableAi]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const grouped = review ? groupBySeverity(review.issues) : null;
  const band = scoreBand(review?.score ?? null);

  return (
    <Card data-testid="layout-review-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Layout review</CardTitle>
            <CardDescription>
              Static checks on the rendered HTML — accessibility, meta tags,
              broken links. Catches things like a missing alt or an undefined
              embed URL before visitors notice.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadLatest}
              disabled={loading || running}
              aria-label="Refresh latest review"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              onClick={triggerRun}
              disabled={running}
              data-testid="layout-review-run"
            >
              {running ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                  Run layout review
                </>
              )}
            </Button>
          </div>
        </div>

        {AI_ENABLED && (
          <label className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={enableAi}
              onChange={(e) => setEnableAi(e.target.checked)}
              disabled={running}
            />
            Also run AI vision polish review (uses your LLM key)
          </label>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {!review && !loading && !error && (
          <p
            className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground"
            data-testid="layout-review-empty"
          >
            No review yet. Click{" "}
            <span className="font-medium">Run layout review</span> to scan your
            rendered portfolio.
          </p>
        )}

        {review && (
          <>
            {/* Headline */}
            <div className="flex items-center gap-3">
              <ScoreBadge score={review.score} band={band} />
              <div className="text-xs text-muted-foreground">
                {review.status === "running" ? (
                  <>Running… (Tier 1)</>
                ) : review.completedAt ? (
                  <>
                    Completed{" "}
                    {new Date(review.completedAt).toLocaleString()}{" "}
                    · template <code>{review.templateId}</code>
                  </>
                ) : null}
                {review.tier2Available === false && (
                  <p className="mt-1 text-[11px]">
                    Tier 2 (browser-rendered) checks didn&apos;t run on this
                    deploy. Self-host with Playwright to enable name-wrap +
                    contrast checks.
                  </p>
                )}
              </div>
            </div>

            {review.error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {review.error}
              </p>
            )}

            {review.aiSummary && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-primary">
                    AI vision summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {review.aiSummary}
                </CardContent>
              </Card>
            )}

            {grouped && (
              <div className="space-y-3">
                <IssueGroup
                  title="Critical"
                  icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                  issues={grouped.critical}
                  emptyOk
                />
                <IssueGroup
                  title="Warnings"
                  icon={
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  }
                  issues={grouped.warning}
                  emptyOk
                />
                <IssueGroup
                  title="Notes"
                  icon={<Info className="h-3.5 w-3.5 text-muted-foreground" />}
                  issues={grouped.info}
                  emptyOk
                />
              </div>
            )}

            {review.issues.length === 0 && review.status === "completed" && (
              <p
                className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400"
                data-testid="layout-review-clean"
              >
                <CheckCircle2 className="h-4 w-4" />
                No issues found. Looking good.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ScoreBadge({
  score,
  band,
}: {
  score: number | null;
  band: ReturnType<typeof scoreBand>;
}) {
  const cls =
    band.tone === "green"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : band.tone === "amber"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : band.tone === "red"
          ? "bg-destructive/10 text-destructive border-destructive/40"
          : "bg-muted text-muted-foreground border-border";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        cls
      )}
      data-testid="layout-review-score"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {score ?? "—"}
        </span>
        <span className="text-xs uppercase tracking-wider">{band.label}</span>
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  icon,
  issues,
  emptyOk,
}: {
  title: string;
  icon: React.ReactNode;
  issues: LayoutIssue[];
  emptyOk?: boolean;
}) {
  if (issues.length === 0 && emptyOk) return null;
  return (
    <div className="space-y-2" data-testid={`issue-group-${title.toLowerCase()}`}>
      <h4 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}{" "}
        <span className="text-[10px] font-normal text-muted-foreground/80">
          ({issues.length})
        </span>
      </h4>
      <ul className="space-y-1.5">
        {issues.map((issue, i) => (
          <li
            key={`${issue.rule}-${i}`}
            className="rounded-md border px-3 py-2 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-foreground">{issue.message}</span>
              <code className="shrink-0 text-[10px] text-muted-foreground">
                {issue.rule}
              </code>
            </div>
            {(issue.page || issue.viewport || issue.elementSelector) && (
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                {issue.page && <span>page: {issue.page}</span>}
                {issue.viewport && <span>viewport: {issue.viewport}px</span>}
                {issue.elementSelector && (
                  <span>
                    selector: <code>{issue.elementSelector}</code>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
