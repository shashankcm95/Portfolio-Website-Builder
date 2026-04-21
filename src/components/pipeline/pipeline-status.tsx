"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  SkipForward,
  Play,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { NextStepBanner } from "@/components/ui/next-step-banner";
import { CancelPipelineButton } from "@/components/pipeline/cancel-pipeline-button";
import { FileText, Upload } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PipelineStep {
  name: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface PipelineStateResponse {
  projectId: string;
  jobId: string;
  currentStep: string | null;
  steps: PipelineStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
  pipelineStatus?: string;
  pipelineError?: string | null;
}

interface PipelineStatusProps {
  portfolioId: string;
  projectId: string;
  initialStatus?: string;
  /**
   * Phase 10, Track H — wire the "Re-upload" button in the targeted
   * resume-parse failure state to the parent's existing file input.
   * When absent, the button is rendered disabled with a tooltip.
   */
  onReuploadResume?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  resume_parse: "Parse Resume",
  resume_structure: "Structure Resume",
  repo_fetch: "Fetch Repository",
  context_generate: "Generate Context",
  fact_extract: "Extract Facts",
  narrative_generate: "Generate Narratives",
  claim_verify: "Verify Claims",
  storyboard_generate: "Build Guided Tour",
};

const POLL_INTERVAL_MS = 2000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStepDuration(step: PipelineStep): string | null {
  if (!step.startedAt) return null;
  const start = new Date(step.startedAt).getTime();
  const end = step.completedAt
    ? new Date(step.completedAt).getTime()
    : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "running":
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "skipped":
      return <SkipForward className="h-5 w-5 text-muted-foreground" />;
    case "pending":
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PipelineStatus({
  portfolioId,
  projectId,
  initialStatus,
  onReuploadResume,
}: PipelineStatusProps) {
  const [pipelineState, setPipelineState] =
    useState<PipelineStateResponse | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const basePath = `/api/portfolios/${portfolioId}/projects/${projectId}/pipeline`;

  // ── Derived state ──

  const steps = pipelineState?.steps ?? [];
  const hasSteps = steps.length > 0;

  const isRunning = steps.some((s) => s.status === "running");

  const isCompleted = pipelineState?.completedAt != null && !pipelineState.error;
  const isFailed = pipelineState?.error != null;

  const completedCount = steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;

  const totalSteps = hasSteps ? steps.length : 7;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // ── Fetch status ──

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/status`);
      if (!res.ok) {
        if (res.status === 404) {
          setPipelineState(null);
          return;
        }
        throw new Error(`Status fetch failed: ${res.status}`);
      }
      const data: PipelineStateResponse = await res.json();
      setPipelineState(data);
    } catch {
      // Silently handle polling errors
    }
  }, [basePath]);

  // ── Polling ──

  useEffect(() => {
    // Do an initial fetch
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (isRunning) {
      pollingRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isRunning, fetchStatus]);

  // ── Start pipeline ──

  async function handleStart() {
    setIsStarting(true);
    setStartError(null);

    try {
      const res = await fetch(basePath, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to start pipeline: ${res.status}`);
      }
      // Immediately fetch the new status
      await fetchStatus();
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "Failed to start pipeline"
      );
    } finally {
      setIsStarting(false);
    }
  }

  // ── Retry (restart) ──

  async function handleRetry() {
    setPipelineState(null);
    await handleStart();
  }

  // ── Render ──

  const showStartButton =
    !hasSteps && !isStarting && initialStatus !== "running";
  const showRetryButton = isFailed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Analysis Pipeline</CardTitle>
        <CardDescription>
          7-step intelligence pipeline that extracts facts, generates narratives,
          and verifies claims from your repository.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar */}
        {hasSteps && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} />
          </div>
        )}

        {hasSteps && <Separator />}

        {/* Step list */}
        {hasSteps ? (
          <div className="space-y-1">
            {steps.map((step, index) => (
              <div key={step.name}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                    step.status === "running" && "bg-blue-50 dark:bg-blue-950/20",
                    step.status === "failed" && "bg-red-50 dark:bg-red-950/20"
                  )}
                >
                  {/* Vertical connector line */}
                  <div className="relative flex flex-col items-center">
                    <StatusIcon status={step.status} />
                    {index < steps.length - 1 && (
                      <div
                        className={cn(
                          "absolute top-6 h-4 w-px",
                          step.status === "completed"
                            ? "bg-green-300"
                            : "bg-border"
                        )}
                      />
                    )}
                  </div>

                  {/* Step name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.status === "pending" && "text-muted-foreground",
                        step.status === "skipped" &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {STEP_LABELS[step.name] ?? step.name}
                    </p>
                    {step.error && (
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 truncate">
                        {step.error}
                      </p>
                    )}
                  </div>

                  {/* Duration */}
                  {(step.status === "running" || step.status === "completed") && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {getStepDuration(step)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isStarting && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Circle className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Pipeline not started</p>
                <p className="text-xs text-muted-foreground">
                  Start the analysis pipeline to extract facts and generate
                  narratives from your repository.
                </p>
              </div>
            </div>
          )
        )}

        {/* Loading state while starting */}
        {isStarting && !hasSteps && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Starting pipeline...
            </span>
          </div>
        )}

        {/* Error display */}
        {(() => {
          // Phase 10, Track H — targeted empty-state for resume parse/structure
          // failures. Matches the `pipelineError` prefix the orchestrator
          // stamps (e.g. `resume_parse: ...`, `resume_structure: ...`) *or*
          // a step-level error on the `resume_parse` / `resume_structure`
          // step. Bumps the user straight to a re-upload action instead of
          // showing the raw exception text.
          const resumeErrorRe = /^resume_(parse|structure)/i;
          const rawError = startError ?? pipelineState?.error;
          const failedStepIsResume = steps.some(
            (s) =>
              s.status === "failed" &&
              (s.name === "resume_parse" || s.name === "resume_structure")
          );
          const isResumeError =
            !startError &&
            isFailed &&
            ((typeof rawError === "string" && resumeErrorRe.test(rawError)) ||
              failedStepIsResume);

          if (isResumeError) {
            return (
              <>
                <Separator />
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      We couldn&apos;t read your resume.
                    </p>
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Supported formats: PDF, DOCX, TXT.
                    </p>
                    <div className="mt-3">
                      {onReuploadResume ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onReuploadResume}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Re-upload
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          title="Use the resume input above."
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Re-upload
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          }

          if (startError || (isFailed && pipelineState?.error)) {
            return (
              <>
                <Separator />
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">
                      Pipeline Error
                    </p>
                    <p className="mt-0.5 text-xs text-red-700 dark:text-red-400 break-words">
                      {startError ?? pipelineState?.error}
                    </p>
                  </div>
                </div>
              </>
            );
          }

          return null;
        })()}
      </CardContent>

      <CardFooter className="gap-2">
        {showStartButton && (
          <Button onClick={handleStart} disabled={isStarting}>
            <Play className="mr-2 h-4 w-4" />
            Start Analysis
          </Button>
        )}
        {showRetryButton && (
          <Button onClick={handleRetry} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
        {isRunning && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </div>
            <CancelPipelineButton
              portfolioId={portfolioId}
              projectId={projectId}
              onCancelled={fetchStatus}
            />
          </div>
        )}
        {isCompleted && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Analysis complete
          </div>
        )}
      </CardFooter>

      {/* Post-completion next-step prompt */}
      {isCompleted && (
        <div className="px-6 pb-6">
          <NextStepBanner
            tone="success"
            title="Analysis complete — your narratives are ready."
            description="Preview the generated portfolio, or deploy it live now."
            cta="See Preview"
            href={`/portfolios/${portfolioId}?tab=preview`}
          />
        </div>
      )}
    </Card>
  );
}
