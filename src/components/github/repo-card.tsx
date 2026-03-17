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
  repoName: string;
  repoOwner: string;
  repoMetadata: RepoMetadata | null;
  pipelineStatus: string;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
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
  }
> = {
  pending: {
    label: "Pending",
    variant: "outline",
    icon: Clock,
    className: "text-muted-foreground",
  },
  running: {
    label: "Analyzing...",
    variant: "default",
    icon: RotateCw,
    className: "text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Analyzed",
    variant: "secondary",
    icon: CheckCircle2,
    className: "text-green-600 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: AlertCircle,
    className: "text-destructive",
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
    <Badge variant={config.variant} className={cn("gap-1", config.className)}>
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
        aria-label={`View details for ${project.repoOwner}/${project.repoName}`}
      />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base truncate">
              {project.repoOwner}/{project.repoName}
            </CardTitle>
            {metadata?.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {metadata.description}
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
        </div>

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
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleAnalyze();
            }}
            disabled={
              isAnalyzing || project.pipelineStatus === "running"
            }
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
                aria-label={`Remove ${project.repoName}`}
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
