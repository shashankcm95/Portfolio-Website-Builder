"use client";

/**
 * Phase 6 — Cross-project pipeline dashboard.
 *
 * Answers: "how much am I spending across everything?"
 *   - 30-day cost trend
 *   - Recent 50 jobs across all projects
 *   - Aggregate totals
 *   - Drill-down modal per job
 *
 * Per-project detail (answering "why is THIS project slow/broken?") lives
 * in the Pipeline tab on the project detail page (§25).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  DollarSign,
  Loader2,
  PlayCircle,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { formatMicroUsd } from "@/lib/ai/pricing";
import { cn } from "@/lib/utils";

interface JobRow {
  jobId: string;
  projectId: string;
  projectName: string;
  status: "running" | "completed" | "failed" | string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

interface Data {
  jobs: JobRow[];
  costByDay: Array<{ date: string; costMicros: number }>;
  totalCostMicros30d: number;
}

interface JobDetail {
  jobId: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  steps: Array<{
    id: string;
    stepName: string;
    status: string;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    modelUsed: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costMicros: number | null;
  }>;
}

export default function PipelineDashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline/history");
      if (!res.ok) {
        setError("Failed to load pipeline history");
        return;
      }
      setData((await res.json()) as Data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Cost trend and recent runs across your projects."
        action={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        }
      />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Cost (30d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatMicroUsd(data.totalCostMicros30d)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sum of every recorded step across your projects.
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Daily cost trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CostSparkline points={data.costByDay} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Recent jobs ({data.jobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.jobs.length === 0 ? (
                <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
                  <p>
                    No pipeline runs yet. Add a GitHub repo to one of your
                    portfolios and analyze it to see cost + timing data here.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/portfolios">Go to Portfolios</Link>
                  </Button>
                </div>
              ) : (
                <table
                  className="w-full text-sm"
                  data-testid="pipeline-jobs-table"
                >
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-left">Project</th>
                      <th className="py-2 text-left">Status</th>
                      <th className="py-2 text-right">Duration</th>
                      <th className="py-2 text-right">Tokens</th>
                      <th className="py-2 text-right">Cost</th>
                      <th className="py-2 text-right">When</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => (
                      <tr
                        key={j.jobId}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="py-2">{j.projectName}</td>
                        <td className="py-2">
                          <StatusPill status={j.status} />
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatDuration(j.durationMs)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {(j.inputTokens + j.outputTokens).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMicroUsd(j.costMicros)}
                        </td>
                        <td className="py-2 text-right text-xs text-muted-foreground">
                          {new Date(j.startedAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveJob(j)}
                            data-testid={`pipeline-job-drilldown-${j.jobId}`}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <JobDrillDownModal
        job={activeJob}
        onClose={() => setActiveJob(null)}
      />
    </div>
  );
}

// ─── Job drill-down modal ───────────────────────────────────────────────────

function JobDrillDownModal({
  job,
  onClose,
}: {
  job: JobRow | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!job) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${job.projectId}/pipeline/history`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: JobDetail[] };
        if (cancelled) return;
        const match = data.jobs.find((j) => j.jobId === job.jobId);
        if (match) setDetail(match);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job]);

  return (
    <Dialog
      open={Boolean(job)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {job?.projectName} — job details
          </DialogTitle>
        </DialogHeader>
        {loading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
        {detail && (
          <div className="space-y-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Started</p>
                <p>{new Date(detail.startedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p>{formatDuration(detail.durationMs)}</p>
              </div>
            </div>
            {detail.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
                {detail.error}
              </p>
            )}
            <ul className="space-y-2">
              {detail.steps.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border px-3 py-2 text-xs"
                  data-step={s.stepName}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.stepName}</span>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <div>{formatDuration(s.durationMs)}</div>
                    <div>
                      {s.inputTokens !== null
                        ? `${s.inputTokens.toLocaleString()}↓ ${
                            s.outputTokens?.toLocaleString() ?? 0
                          }↑`
                        : "—"}
                    </div>
                    <div className="text-right">
                      {s.costMicros !== null
                        ? formatMicroUsd(s.costMicros)
                        : "—"}
                    </div>
                  </div>
                  {s.error && (
                    <p className="mt-1 text-destructive">{s.error}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const [Icon, tone, label]: [
    typeof CheckCircle2 | typeof XCircle | typeof PlayCircle | typeof CircleDashed,
    string,
    string,
  ] =
    status === "completed"
      ? [CheckCircle2, "text-emerald-600 dark:text-emerald-400", "completed"]
      : status === "failed"
        ? [XCircle, "text-rose-600 dark:text-rose-400", "failed"]
        : status === "running"
          ? [PlayCircle, "text-blue-600 dark:text-blue-400", "running"]
          : status === "skipped"
            ? [CircleDashed, "text-muted-foreground", "skipped"]
            : [CircleDashed, "text-muted-foreground", status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function CostSparkline({
  points,
}: {
  points: Array<{ date: string; costMicros: number }>;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground">No cost data yet.</p>;
  }
  const max = Math.max(...points.map((p) => p.costMicros), 1);
  const width = 500;
  const height = 80;
  const step = width / Math.max(points.length - 1, 1);
  const polyline = points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p.costMicros / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
        className="text-primary"
      />
    </svg>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}
