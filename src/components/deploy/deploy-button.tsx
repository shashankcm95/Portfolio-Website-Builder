"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Rocket,
  Loader2,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  FileCode2,
  Upload,
  Copy,
  Check,
} from "lucide-react";
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

// ─── Types ──────────────────────────────────────────────────────────────────

type DeployPhase =
  | "idle"
  | "loading"
  | "generating"
  | "deploying"
  | "done"
  | "error";

interface Deployment {
  id: string;
  url: string | null;
  status: string;
  deployedAt: string | null;
  createdAt: string;
}

interface DeployButtonProps {
  portfolioId: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DeployButton({ portfolioId }: DeployButtonProps) {
  const [phase, setPhase] = useState<DeployPhase>("loading");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [lastDeployedAt, setLastDeployedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch the last successful deployment on mount so the URL persists across
  // page refreshes — previously, the URL was only in local state and vanished.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portfolios/${portfolioId}/deploy`);
        if (!res.ok) {
          if (!cancelled) setPhase("idle");
          return;
        }
        const { deployments } = (await res.json()) as {
          deployments: Deployment[];
        };
        if (cancelled) return;
        const latestActive = deployments.find(
          (d) => d.status === "active" && d.url
        );
        if (latestActive?.url) {
          setLiveUrl(latestActive.url);
          setLastDeployedAt(
            latestActive.deployedAt ?? latestActive.createdAt ?? null
          );
          setPhase("done");
        } else {
          setPhase("idle");
        }
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const progressValue =
    phase === "idle" || phase === "loading"
      ? 0
      : phase === "generating"
        ? 33
        : phase === "deploying"
          ? 66
          : phase === "done"
            ? 100
            : 0;

  const handleDeploy = useCallback(async () => {
    setPhase("generating");
    setError(null);

    try {
      // Step 1: Generate static site
      const generateRes = await fetch(
        `/api/portfolios/${portfolioId}/generate`,
        { method: "POST" }
      );

      if (!generateRes.ok) {
        const body = await generateRes.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Generation failed with status ${generateRes.status}`
        );
      }

      // Step 2: Deploy to hosting
      setPhase("deploying");

      const deployRes = await fetch(
        `/api/portfolios/${portfolioId}/deploy`,
        { method: "POST" }
      );

      if (!deployRes.ok) {
        const body = await deployRes.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Deployment failed with status ${deployRes.status}`
        );
      }

      const deployData = await deployRes.json();
      setLiveUrl(deployData.url ?? null);
      setLastDeployedAt(new Date().toISOString());
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed");
      setPhase("error");
    }
  }, [portfolioId]);

  const handleRetry = useCallback(() => {
    handleDeploy();
  }, [handleDeploy]);

  const handleCopy = useCallback(async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors silently
    }
  }, [liveUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Deploy Portfolio</CardTitle>
        <CardDescription>
          Generate your static portfolio site and deploy it to the web.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress indicator (only during active deploy) */}
        {(phase === "generating" || phase === "deploying") && (
          <div className="space-y-3">
            <Progress value={progressValue} />

            <div className="flex items-center gap-3">
              <PhaseStep
                label="Generate"
                icon={FileCode2}
                isActive={phase === "generating"}
                isDone={phase === "deploying"}
              />
              <div className="h-px flex-1 bg-border" />
              <PhaseStep
                label="Deploy"
                icon={Upload}
                isActive={phase === "deploying"}
                isDone={false}
              />
              <div className="h-px flex-1 bg-border" />
              <PhaseStep
                label="Live"
                icon={CheckCircle2}
                isActive={false}
                isDone={false}
              />
            </div>
          </div>
        )}

        {/* Loading initial deployment state */}
        {phase === "loading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking deployment status...
          </div>
        )}

        {/* Persisted live URL (loaded on mount or after successful deploy) */}
        {phase === "done" && liveUrl && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Live
              </p>
              {lastDeployedAt && (
                <span className="text-xs text-green-700/70 dark:text-green-400/70">
                  · {formatRelativeTime(lastDeployedAt)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center gap-1.5 font-mono text-sm text-green-700 break-all hover:underline dark:text-green-400"
              >
                {liveUrl}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                aria-label="Copy URL"
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Error display */}
        {phase === "error" && error && (
          <>
            <Separator />
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Deployment Failed
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-400 break-words">
                  {error}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Post-deploy next-step CTA */}
        {phase === "done" && liveUrl && (
          <NextStepBanner
            tone="success"
            title="You're live!"
            description="Share the URL, or set up a custom domain next."
            cta="Custom Domain"
            href={`/portfolios/${portfolioId}?tab=domains`}
          />
        )}
      </CardContent>

      <CardFooter className="gap-2">
        {(phase === "idle" || phase === "done") && (
          <Button onClick={handleDeploy}>
            <Rocket className="mr-2 h-4 w-4" />
            {phase === "done" ? "Redeploy" : "Generate & Deploy"}
          </Button>
        )}

        {(phase === "generating" || phase === "deploying") && (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {phase === "generating" ? "Generating..." : "Deploying..."}
          </Button>
        )}

        {phase === "error" && (
          <Button onClick={handleRetry} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function PhaseStep({
  label,
  icon: Icon,
  isActive,
  isDone,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isDone: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
          isDone
            ? "border-green-500 bg-green-50 dark:bg-green-950/30"
            : isActive
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : "border-muted bg-background"
        }`}
      >
        {isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        ) : isDone ? (
          <Icon className="h-4 w-4 text-green-500" />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <span
        className={`text-[10px] font-medium ${
          isDone
            ? "text-green-600"
            : isActive
              ? "text-blue-600"
              : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
