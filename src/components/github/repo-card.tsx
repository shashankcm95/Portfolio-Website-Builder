"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Star,
  Play,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Award,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CredibilityBadges } from "@/components/github/credibility-badges";
import { ProjectCategoryBadge } from "@/components/github/project-category-badge";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import type {
  RepoCategory,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";
import type { ProjectDemo as ProjectDemoModel } from "@/lib/demos/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RepoMetadata {
  description?: string | null;
  language?: string | null;
  stars?: number;
  forks?: number;
  topics?: string[];
  htmlUrl?: string;
  [key: string]: unknown;
}

interface Project {
  id: string;
  repoName: string | null;
  repoOwner: string | null;
  repoMetadata: RepoMetadata | null;
  pipelineStatus: string;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
  // Wave 3B: manual (non-GitHub) projects
  sourceType?: string | null;
  displayName?: string | null;
  manualDescription?: string | null;
  externalUrl?: string | null;
  imageUrl?: string | null;
  techStack?: string[] | null;
  // Phase 1+2: credibility signals (GitHub projects only; null on manual/unfetched).
  // Uses StoredCredibilitySignals so v1 rows (pre-Phase-2) round-trip without
  // crashing — the authorshipSignal/commitActivity/etc. fields are optional
  // on the reader type.
  credibilitySignals?: StoredCredibilitySignals | null;
  credibilityFetchedAt?: string | null;
  // Phase 8: repo category (personal_learning / personal_tool / oss_author /
  // oss_contributor / unspecified). Shown as a small informational badge on
  // the card, replacing the Phase-2 authorship verdict chip.
  projectCategory?: RepoCategory | null;
  projectCategorySource?: "auto" | "manual" | null;
  // Phase 4: ordered user-supplied demos (video/image/slideshow).
  demos?: ProjectDemoModel[] | null;
}

interface RepoCardProps {
  project: Project;
  portfolioId: string;
  onUpdate?: () => void;
}

type PipelineStatus = "pending" | "running" | "completed" | "failed";

// ─── Helpers ────────────────────────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Ruby: "bg-red-600",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-500",
  Dart: "bg-sky-400",
  PHP: "bg-indigo-400",
  Shell: "bg-emerald-500",
  HTML: "bg-orange-500",
  CSS: "bg-purple-400",
};

function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

const PIPELINE_STATUS_CONFIG: Record<
  PipelineStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ElementType;
    className: string;
    tooltip: string;
  }
> = {
  pending: {
    label: "Pending",
    variant: "outline",
    icon: Clock,
    className: "text-muted-foreground",
    tooltip:
      "Repository analysis has not started yet. Click Analyze to extract facts and generate narratives.",
  },
  running: {
    label: "Analyzing...",
    variant: "default",
    icon: RotateCw,
    className: "text-blue-600 dark:text-blue-400",
    tooltip:
      "The 7-step AI pipeline is currently analyzing this repository's code, commits, and context.",
  },
  completed: {
    label: "Analyzed",
    variant: "secondary",
    icon: CheckCircle2,
    className: "text-green-600 dark:text-green-400",
    tooltip:
      "Analysis complete — facts extracted, narratives generated, and claims verified. Ready for your portfolio.",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: AlertCircle,
    className: "text-destructive",
    tooltip:
      "The last analysis attempt failed. Click Re-analyze to try again.",
  },
};

// ─── Pipeline Status Badge ──────────────────────────────────────────────────

function PipelineStatusBadge({ status }: { status: string }) {
  const normalizedStatus = (
    Object.keys(PIPELINE_STATUS_CONFIG).includes(status) ? status : "pending"
  ) as PipelineStatus;

  const config = PIPELINE_STATUS_CONFIG[normalizedStatus];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1", config.className)}
      title={config.tooltip}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          normalizedStatus === "running" && "animate-spin"
        )}
      />
      {config.label}
    </Badge>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RepoCard({ project, portfolioId, onUpdate }: RepoCardProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionError, setActionError] = useState("");

  const metadata = project.repoMetadata as RepoMetadata | null;
  const isManual = project.sourceType === "manual";

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setActionError("");

    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/projects/${project.id}/analyze`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${response.status})`);
      }

      onUpdate?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to start analysis"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [portfolioId, project.id, onUpdate]);

  const handleRemove = useCallback(async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }

    setIsRemoving(true);
    setActionError("");

    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/projects/${project.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Remove failed (${response.status})`);
      }

      onUpdate?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to remove project"
      );
      setConfirmRemove(false);
    } finally {
      setIsRemoving(false);
    }
  }, [confirmRemove, portfolioId, project.id, onUpdate]);

  const handleCardClick = useCallback(() => {
    router.push(
      `/portfolios/${portfolioId}/projects/${project.id}`
    );
  }, [router, portfolioId, project.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCardClick();
      }
    },
    [handleCardClick]
  );

  return (
    <Card
      className={cn(
        "group relative transition-shadow hover:shadow-md",
        !project.isVisible && "opacity-60"
      )}
    >
      {/* Clickable overlay for navigation */}
      <div
        role="link"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 z-0 cursor-pointer rounded-lg"
        aria-label={`View details for ${
          isManual
            ? project.displayName ?? "project"
            : `${project.repoOwner}/${project.repoName}`
        }`}
      />

      {/* Phase 4 — thumbnail banner (closes Wave-3B imageUrl latent bug).
       *   Source priority: imageUrl → first demo → nothing. */}
      <ProjectThumbnail
        imageUrl={project.imageUrl}
        demos={project.demos}
      />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base truncate">
              {isManual
                ? project.displayName ?? "Untitled project"
                : `${project.repoOwner}/${project.repoName}`}
            </CardTitle>
            {(isManual ? project.manualDescription : metadata?.description) && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {isManual ? project.manualDescription : metadata?.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {project.isFeatured && (
              <Award className="h-4 w-4 text-amber-500" aria-label="Featured project" />
            )}
            {!project.isVisible && (
              <EyeOff className="h-4 w-4 text-muted-foreground" aria-label="Hidden from portfolio" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {isManual ? (
            <>
              <Badge variant="outline" className="text-xs">
                Manual
              </Badge>
              {project.techStack?.slice(0, 4).map((t) => (
                <Badge key={t} variant="secondary" className="text-xs font-normal">
                  {t}
                </Badge>
              ))}
            </>
          ) : (
            <>
              {metadata?.language && (
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full",
                      LANGUAGE_COLORS[metadata.language] || "bg-gray-400"
                    )}
                  />
                  {metadata.language}
                </span>
              )}
              {typeof metadata?.stars === "number" && (
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" />
                  {formatStarCount(metadata.stars)}
                </span>
              )}
              <PipelineStatusBadge status={project.pipelineStatus} />
            </>
          )}
        </div>

        {/* Phase 1 — Credibility badges; Phase 8 — Category badge (replaces
         *   the old authorship verdict chip). Category is purely informational —
         *   no grade, no "N of 6 positive" language. */}
        {!isManual && project.credibilitySignals && (
          <div className="mt-3 space-y-2">
            <ProjectCategoryBadge
              category={project.projectCategory ?? "unspecified"}
              source={project.projectCategorySource ?? "auto"}
              compact
            />
            <CredibilityBadges
              signals={project.credibilitySignals}
              compact
            />
            {project.credibilityFetchedAt && (
              <VerifiedStamp
                fetchedAt={project.credibilityFetchedAt}
                portfolioId={portfolioId}
                projectId={project.id}
                onRefreshed={onUpdate}
              />
            )}
          </div>
        )}

        {actionError && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-2 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
            <p className="text-xs text-destructive">{actionError}</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        {/* Action buttons - raised above the clickable overlay */}
        <div className="relative z-10 flex items-center gap-2 w-full">
          {isManual ? (
            project.externalUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                asChild
              >
                <a
                  href={project.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
              </Button>
            ) : null
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleAnalyze();
              }}
              disabled={isAnalyzing || project.pipelineStatus === "running"}
            >
              {isAnalyzing || project.pipelineStatus === "running" ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {project.pipelineStatus === "completed"
                    ? "Re-analyze"
                    : "Analyze"}
                </>
              )}
            </Button>
          )}

          <div className="ml-auto">
            {confirmRemove ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Remove?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  disabled={isRemoving}
                >
                  {isRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Yes"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(false);
                  }}
                  disabled={isRemoving}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${project.displayName ?? project.repoName ?? "project"}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

// ─── Verified Stamp (Phase 1) ───────────────────────────────────────────────

function VerifiedStamp({
  fetchedAt,
  portfolioId,
  projectId,
  onRefreshed,
}: {
  fetchedAt: string;
  portfolioId: string;
  projectId: string;
  onRefreshed?: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/${projectId}/credibility/refresh`,
        { method: "POST" }
      );
      if (!res.ok) {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          const sec = body.retryAfterSeconds ?? 300;
          setError(`Refreshed too recently — try again in ${sec}s`);
        } else {
          setError("Failed to refresh");
        }
        return;
      }
      onRefreshed?.();
    } catch {
      setError("Network error");
    } finally {
      setRefreshing(false);
    }
  }, [portfolioId, projectId, refreshing, onRefreshed]);

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      <span>Verified {relativeStamp(fetchedAt)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Refresh credibility signals"
        title="Re-fetch badges from GitHub"
      >
        <RotateCw
          className={cn("h-3 w-3", refreshing && "animate-spin")}
        />
      </Button>
      {error && <span className="text-destructive">· {error}</span>}
    </div>
  );
}

function relativeStamp(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(elapsed / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
