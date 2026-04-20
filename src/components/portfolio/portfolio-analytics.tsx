"use client";

/**
 * Phase 6 — Full-width Analytics tab view.
 *
 * Fetches a single aggregation from `/api/portfolios/:id/analytics` and
 * renders:
 *   - Headline: pageviews (7d) vs prior 7d, with delta arrow
 *   - Sparkline: 14-day daily pageview count (inline SVG, no chart lib)
 *   - Chatbot messages (7d) — same delta treatment
 *   - Top 5 paths / referrers / countries
 *
 * Empty-state messaging for a portfolio that hasn't been deployed +
 * visited yet. Graceful degradation when NEXT_PUBLIC_APP_URL is missing
 * (the beacon never fires, so counts stay at 0 — still valid).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Eye,
  Globe,
  Link2,
  Loader2,
  MessageSquare,
  Minus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AnalyticsSummary {
  pageviewsCurrent: number;
  pageviewsPrevious: number;
  pageviewsDaily: Array<{ date: string; count: number }>;
  chatbotMessagesCurrent: number;
  chatbotMessagesPrevious: number;
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

interface PortfolioAnalyticsProps {
  portfolioId: string;
}

export function PortfolioAnalytics({ portfolioId }: PortfolioAnalyticsProps) {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/analytics`
      );
      if (!res.ok) {
        setError("Failed to load analytics");
        return;
      }
      setData((await res.json()) as AnalyticsSummary);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6" data-testid="portfolio-analytics">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Pageviews, top pages, and chatbot traffic — last 14 days.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          data-testid="analytics-refresh"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {data === null && loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {data !== null && (
        <>
          {/* Headline metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={<Eye className="h-4 w-4" />}
              label="Pageviews (7d)"
              value={data.pageviewsCurrent}
              previous={data.pageviewsPrevious}
            />
            <MetricCard
              icon={<MessageSquare className="h-4 w-4" />}
              label="Chatbot messages (7d)"
              value={data.chatbotMessagesCurrent}
              previous={data.chatbotMessagesPrevious}
            />
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  14-day trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Sparkline
                  data={data.pageviewsDaily.map((d) => d.count)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Top-N lists */}
          <div className="grid gap-4 md:grid-cols-3">
            <TopList
              icon={<Link2 className="h-4 w-4" />}
              title="Top pages"
              rows={data.topPaths.map((p) => ({
                key: p.path,
                label: p.path,
                count: p.count,
              }))}
              emptyMessage="No pageviews yet."
            />
            <TopList
              icon={<Globe className="h-4 w-4" />}
              title="Top referrers"
              rows={data.topReferrers.map((r) => ({
                key: r.referrer,
                label: r.referrer.replace(/^https?:\/\//, ""),
                count: r.count,
              }))}
              emptyMessage="Direct traffic only so far."
            />
            <TopList
              icon={<Globe className="h-4 w-4" />}
              title="Top countries"
              rows={data.topCountries.map((c) => ({
                key: c.country,
                label: c.country,
                count: c.count,
              }))}
              emptyMessage="Country data requires Cloudflare Pages hosting."
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  previous,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  previous: number;
}) {
  const delta = value - previous;
  const pct =
    previous > 0 ? Math.round((delta / previous) * 100) : value > 0 ? 100 : 0;
  const trend: "up" | "down" | "flat" =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const trendClass =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {value.toLocaleString()}
          </span>
          <span className={cn("flex items-center gap-0.5 pb-1 text-xs", trendClass)}>
            <TrendIcon className="h-3 w-3" />
            {trend === "flat" ? "no change" : `${Math.abs(pct)}%`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          vs. prior 7d: {previous.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const max = Math.max(...data, 1);
  const width = 260;
  const height = 60;
  const step = width / Math.max(data.length - 1, 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-primary"
      />
    </svg>
  );
}

function TopList({
  icon,
  title,
  rows,
  emptyMessage,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ key: string; label: string; count: number }>;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm text-foreground">{r.label}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {r.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
