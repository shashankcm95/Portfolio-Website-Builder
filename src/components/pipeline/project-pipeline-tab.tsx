"use client";

/**
 * Phase 6 — Per-project Pipeline tab.
 *
 * Answers: "why is THIS project slow / expensive / broken?"
 *   - Live status of current/most-recent job (with progress line if running).
 *   - Last 20 jobs for this project (compact).
 *   - Per-step breakdown on selection (timing + tokens + error).
 *
 * The cross-project cost overview lives at `/dashboard/pipeline`; this
 * tab is single-purpose per-project.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMicroUsd } from "@/lib/ai/pricing";
import { cn } from "@/lib/utils";

interface StepRow {
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
}

interface JobRow {
  jobId: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  steps: StepRow[];
}

interface ProjectPipelineTabProps {
  projectId: string;
  /** Optional callback to trigger a pipeline retry — parent owns the handler. */
  onRetry?: () => void;
}

export function ProjectPipelineTab({
  projectId,
  onRetry,
}: ProjectPipelineTabProps) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/pipeline/history`
      );
      if (!res.ok) {
        setError("Failed to load pipeline history");
        return;
      }
      const data = (await res.json()) as { jobs: JobRow[] };
      setJobs(data.jobs);
      if (data.jobs.length > 0 && !selectedJobId) {
        setSelectedJobId(data.jobs[0].jobId);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
    // Intentionally omit selectedJobId from deps — first-load auto-select
    // shouldn't re-fire when the user picks a different job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedJob = useMemo(
    () => jobs?.find((j) => j.jobId === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );
  const totalCost = useMemo(
    () =>
      selectedJob?.steps.reduce((s, st) => s + (st.costMicros ?? 0), 0) ?? 0,
    [selectedJob]
  );
  const totalTokens = useMemo(
    () =>
      selectedJob?.steps.reduce(
        (s, st) => s + (st.inputTokens ?? 0) + (st.outputTokens ?? 0),
        0
      ) ?? 0,
    [selectedJob]
  );

  return (
    <div className="space-y-4" data-testid="project-pipeline-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Job history, per-step timing, and cost for this project.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              data-testid="pipeline-retry"
            >
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
              Run pipeline
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {jobs && jobs.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No pipeline runs for this project yet.{" "}
            {onRetry ? (
              <>
                Click{" "}
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Run pipeline
                </button>{" "}
                above to analyze it.
              </>
            ) : (
              <>Open the Details tab to trigger one.</>
            )}
          </CardContent>
        </Card>
      )}

      {jobs && jobs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Left: compact list of jobs */}
          <Card className="md:max-h-[520px] md:overflow-y-auto">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last {jobs.length} runs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {jobs.map((j) => (
                <button
                  key={j.jobId}
                  type="button"
                  onClick={() => setSelectedJobId(j.jobId)}
                  className={cn(
                    "w-full rounded-md border px-2 py-1.5 text-left text-xs",
                    selectedJobId === j.jobId
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted/40"
                  )}
                  data-testid={`project-pipeline-job-${j.jobId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill status={j.status} />
                    <span className="text-[10px] text-muted-foreground">
                      {formatDuration(j.durationMs)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(j.startedAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Right: selected job detail */}
          <div className="space-y-4">
            {selectedJob ? (
              <>
                {selectedJob.error && (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selectedJob.error}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <Stat label="Duration" value={formatDuration(selectedJob.durationMs)} />
                  <Stat
                    label="Tokens"
                    value={totalTokens.toLocaleString()}
                  />
                  <Stat label="Cost" value={formatMicroUsd(totalCost)} />
                </div>

                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Steps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedJob.steps.map((s) => (
                        <li
                          key={s.id}
                          className="rounded-md border px-3 py-2 text-xs"
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
                      {selectedJob.steps.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No steps recorded yet.
                        </p>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick a run from the list on the left.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small subcomponents ────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

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

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}
