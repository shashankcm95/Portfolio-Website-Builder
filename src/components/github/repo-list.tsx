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
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

import type { StoredCredibilitySignals } from "@/lib/credibility/types";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </p>
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
