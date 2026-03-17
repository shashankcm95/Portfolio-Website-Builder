"use client";

import { useCallback, useState } from "react";
import {
  Rocket,
  Loader2,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  FileCode2,
  Upload,
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

// ─── Types ──────────────────────────────────────────────────────────────────

type DeployPhase = "idle" | "generating" | "deploying" | "done" | "error";

interface DeployButtonProps {
  portfolioId: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DeployButton({ portfolioId }: DeployButtonProps) {
  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progressValue =
    phase === "idle"
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
    setLiveUrl(null);

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
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed");
      setPhase("error");
    }
  }, [portfolioId]);

  const handleRetry = useCallback(() => {
    handleDeploy();
  }, [handleDeploy]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Deploy Portfolio</CardTitle>
        <CardDescription>
          Generate your static portfolio site and deploy it to the web.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress indicator */}
        {phase !== "idle" && phase !== "error" && (
          <div className="space-y-3">
            <Progress value={progressValue} />

            <div className="flex items-center gap-3">
              {/* Phase steps */}
              <PhaseStep
                label="Generate"
                icon={FileCode2}
                isActive={phase === "generating"}
                isDone={
                  phase === "deploying" || phase === "done"
                }
              />
              <div className="h-px flex-1 bg-border" />
              <PhaseStep
                label="Deploy"
                icon={Upload}
                isActive={phase === "deploying"}
                isDone={phase === "done"}
              />
              <div className="h-px flex-1 bg-border" />
              <PhaseStep
                label="Live"
                icon={CheckCircle2}
                isActive={false}
                isDone={phase === "done"}
              />
            </div>
          </div>
        )}

        {/* Success: Live URL */}
        {phase === "done" && liveUrl && (
          <>
            <Separator />
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Successfully deployed
                </p>
              </div>
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400 hover:underline font-mono break-all"
              >
                {liveUrl}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </div>
          </>
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
