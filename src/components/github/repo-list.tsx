"use client";

import { useCallback, useEffect, useState } from "react";
import { RepoCard } from "@/components/github/repo-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  FolderGit2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Loader2,
  Wand2,
} from "lucide-react";
import { CoachingModal } from "@/components/portfolio/coaching-modal";
import { aggregateSuggestions } from "@/lib/credibility/suggestions";

// ─── Types ──────────────────────────────────────────────────────────────────

import type {
  CredibilitySignals,
  RepoCategory,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";
import type { ProjectDemo as ProjectDemoModel } from "@/lib/demos/types";

interface Project {
  id: string;
  repoName: string | null;
  repoOwner: string | null;
  repoMetadata: Record<string, unknown> | null;
  pipelineStatus: string;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
  sourceType?: string | null;
  displayName?: string | null;
  manualDescription?: string | null;
  externalUrl?: string | null;
  imageUrl?: string | null;
  techStack?: string[] | null;
  credibilitySignals?: StoredCredibilitySignals | null;
  credibilityFetchedAt?: string | null;
  // Phase 8 — category badge on the card + coaching-modal input fields
  projectCategory?: RepoCategory | null;
  projectCategorySource?: "auto" | "manual" | null;
  dismissedSuggestions?: string[] | null;
  demos?: ProjectDemoModel[] | null;
}

interface RepoListProps {
  portfolioId: string;
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function RepoCardSkeleton() {
  return (
    <Card>
      <div className="p-6 pb-3 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-xs" />
          </div>
        </div>
      </div>
      <div className="px-6 pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <div className="p-6 pt-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <div className="ml-auto">
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <RepoCardSkeleton />
      <RepoCardSkeleton />
      <RepoCardSkeleton />
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FolderGit2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No projects yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Add a GitHub repository above to get started. Each repository will be
          analyzed to generate content for your portfolio.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Error State ────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-1">Failed to load projects</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {message}
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RepoList({ portfolioId }: RepoListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachingOpen, setCoachingOpen] = useState(false);
  // Phase E8c — "Analyze all" batch state. Tracks (started, total,
  // failed) so the button label reflects progress and the operator
  // sees per-batch outcomes inline. `running` flips the button into
  // a disabled spinner while requests are in flight.
  const [analyzeAll, setAnalyzeAll] = useState<{
    running: boolean;
    started: number;
    total: number;
    failed: number;
    message: string | null;
  }>({
    running: false,
    started: 0,
    total: 0,
    failed: 0,
    message: null,
  });

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/projects`
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to load projects (${response.status})`
        );
      }

      const data = await response.json();
      const projectList: Project[] = Array.isArray(data)
        ? data
        : data.projects ?? [];

      // Sort by displayOrder
      projectList.sort((a, b) => a.displayOrder - b.displayOrder);

      setProjects(projectList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load projects"
      );
    } finally {
      setIsLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleReorder = useCallback(
    async (projectId: string, direction: "up" | "down") => {
      const currentIndex = projects.findIndex((p) => p.id === projectId);
      if (currentIndex === -1) return;

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= projects.length) return;

      // Optimistically reorder in state
      const reordered = [...projects];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      // Update displayOrder values
      const updated = reordered.map((p, i) => ({
        ...p,
        displayOrder: i,
      }));

      setProjects(updated);

      // Persist the new order to the server
      try {
        const response = await fetch(
          `/api/portfolios/${portfolioId}/projects/reorder`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectIds: updated.map((p) => p.id),
            }),
          }
        );

        if (!response.ok) {
          // Revert on failure
          fetchProjects();
        }
      } catch {
        // Revert on network error
        fetchProjects();
      }
    },
    [projects, portfolioId, fetchProjects]
  );

  /**
   * Phase E8c — Fan out `/analyze` POSTs across every GitHub-sourced
   * project that isn't already running. Manual (non-GitHub) projects
   * have nothing to analyze; we filter them out so the button label
   * reflects the actionable count.
   *
   * Concurrency cap of 4 prevents a 30-project portfolio from
   * hammering the LLM provider in one burst (and blowing through
   * BYOK rate limits). The pipeline endpoint itself is idempotent —
   * re-clicking while batches are in flight just no-ops the in-flight
   * ones since the button disables.
   */
  const handleAnalyzeAll = useCallback(async () => {
    const targets = projects.filter(
      (p) =>
        p.sourceType !== "manual" &&
        p.pipelineStatus !== "running"
    );
    if (targets.length === 0) {
      setAnalyzeAll((s) => ({
        ...s,
        message: "No projects to analyze right now.",
      }));
      return;
    }

    setAnalyzeAll({
      running: true,
      started: 0,
      total: targets.length,
      failed: 0,
      message: null,
    });

    const CONCURRENCY = 4;
    let cursor = 0;
    let started = 0;
    let failed = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= targets.length) return;
        const project = targets[idx];
        try {
          const res = await fetch(
            `/api/portfolios/${portfolioId}/projects/${project.id}/analyze`,
            { method: "POST" }
          );
          if (!res.ok) {
            failed += 1;
          } else {
            started += 1;
          }
        } catch {
          failed += 1;
        }
        // Update progress so the user sees movement during long batches.
        setAnalyzeAll((s) => ({
          ...s,
          started,
          failed,
        }));
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker)
    );

    setAnalyzeAll({
      running: false,
      started,
      total: targets.length,
      failed,
      message:
        failed === 0
          ? `Started analysis on ${started} ${started === 1 ? "project" : "projects"}. Refresh in a moment to see updated statuses.`
          : `Started ${started} of ${targets.length} (${failed} failed to start). The failures are usually rate-limit or BYOK-key issues.`,
    });

    // Refresh once everyone has been kicked off so the cards
    // immediately flip into the "running" state without waiting for
    // the operator's manual click.
    fetchProjects();
  }, [portfolioId, projects, fetchProjects]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchProjects} />;
  }

  if (projects.length === 0) {
    return <EmptyState />;
  }

  // Phase E8c — how many projects can be analyzed right now. Manual
  // (non-GitHub) projects have no pipeline, and projects already running
  // would only get a no-op response. The button hides when the count
  // is zero so we don't tempt the operator with a dead action.
  const analyzeableCount = projects.filter(
    (p) => p.sourceType !== "manual" && p.pipelineStatus !== "running"
  ).length;

  // Phase 8 — aggregate count of open strengthening suggestions across all
  // projects, used to label the "View all suggestions" button. Projects
  // with no category or no credibility signals contribute nothing.
  const openSuggestionCount = aggregateSuggestions(
    projects
      .filter(
        (p) =>
          p.credibilitySignals?.authorshipSignal?.status === "ok" &&
          p.sourceType !== "manual"
      )
      .map((p) => ({
        projectId: p.id,
        projectName: p.displayName ?? p.repoName ?? "project",
        // `StoredCredibilitySignals` has the v2 fields (commitActivity,
        // commitMessages, externalUrl, authorshipSignal) as optional to
        // round-trip legacy rows. `aggregateSuggestions` wants the full
        // `CredibilitySignals` shape. The .filter() above narrows to rows
        // with `authorshipSignal.status === "ok"`, which implies a freshly
        // scored signal that has every v2 field populated, so the widening
        // cast is runtime-safe.
        signals: p.credibilitySignals as CredibilitySignals,
        category: (p.projectCategory ?? "unspecified") as RepoCategory,
        dismissedIds: p.dismissedSuggestions ?? [],
      }))
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </p>
        <div className="flex items-center gap-2">
          {/* Phase E8c — batch analyze. Visible whenever there's at
              least one GitHub-sourced project not currently running.
              Disabled while a batch is in flight; label flips to
              "Analyzing X / Y" with a spinner. */}
          {analyzeableCount > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={handleAnalyzeAll}
              disabled={analyzeAll.running}
              className="gap-1.5"
              data-testid="analyze-all-button"
              title={`Run the analysis pipeline on all ${analyzeableCount} GitHub-sourced ${analyzeableCount === 1 ? "project" : "projects"} that aren't already running.`}
            >
              {analyzeAll.running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing {analyzeAll.started} / {analyzeAll.total}
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  Analyze all ({analyzeableCount})
                </>
              )}
            </Button>
          )}
          {openSuggestionCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCoachingOpen(true)}
              className="gap-1.5"
              data-testid="coaching-modal-trigger"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Strengthen portfolio ({openSuggestionCount})
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchProjects}
            className="text-muted-foreground"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Phase E8c — batch result message. Shown after a run completes
          so the operator sees the outcome without checking dev tools. */}
      {analyzeAll.message && (
        <p
          className={`text-xs ${
            analyzeAll.failed > 0
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
          role="status"
        >
          {analyzeAll.message}
        </p>
      )}

      <CoachingModal
        portfolioId={portfolioId}
        open={coachingOpen}
        onOpenChange={setCoachingOpen}
        onDismissed={fetchProjects}
        projects={projects
          .filter(
            (p) =>
              p.credibilitySignals?.authorshipSignal?.status === "ok" &&
              p.sourceType !== "manual"
          )
          .map((p) => ({
            id: p.id,
            name: p.displayName ?? p.repoName ?? "project",
            signals: p.credibilitySignals,
            category: (p.projectCategory ?? "unspecified") as RepoCategory,
            dismissedSuggestions: p.dismissedSuggestions ?? [],
          }))}
      />

      <div className="space-y-3">
        {projects.map((project, index) => (
          <div key={project.id} className="flex items-start gap-2">
            {/* Reorder Controls */}
            <div className="flex flex-col gap-0.5 pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => handleReorder(project.id, "up")}
                disabled={index === 0}
                aria-label={`Move ${project.repoName} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => handleReorder(project.id, "down")}
                disabled={index === projects.length - 1}
                aria-label={`Move ${project.repoName} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Project Card */}
            <div className="flex-1 min-w-0">
              <RepoCard
                project={project}
                portfolioId={portfolioId}
                onUpdate={fetchProjects}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
