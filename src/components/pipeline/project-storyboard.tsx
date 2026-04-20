"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCw, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  StoryboardCard,
  cardSlotBelow,
} from "@/components/pipeline/storyboard-card";
import {
  applyUserDemoToStoryboard,
  storyboardPayloadSchema,
  type StoryboardPayload,
} from "@/lib/ai/schemas/storyboard";
import { resolveDemo } from "@/lib/demos/platform-detect";
import { toRenderMode } from "@/lib/demos/render-mode";
import type {
  DemoRenderMode,
  ProjectDemo,
} from "@/lib/demos/types";

interface ProjectStoryboardProps {
  projectId: string;
  /**
   * Optional SSR-hydrated payload. When provided, skip the initial GET fetch
   * (detail page loads the payload via the project GET).
   */
  initialPayload?: StoryboardPayload | null;
  /**
   * Phase 4 — user-supplied demos for this project. When present, Card 6
   * renders `<ProjectDemo>` inline and the merge helper rewrites the
   * LLM's URL to the user's choice.
   */
  userDemos?: ProjectDemo[];
  className?: string;
}

/**
 * Top-level Guided Tour component. Fetches the storyboard payload (unless
 * hydrated), renders 6 cards in a grid, and exposes a regenerate button.
 *
 * States:
 *   - loading      → skeleton grid
 *   - empty / 404  → "Guided Tour hasn't been generated yet" + regenerate button
 *   - ready        → 6-card grid, card 2 embeds the mermaid diagram
 *   - regenerating → dim the grid, show spinner on the button
 *   - error        → small error banner above the grid; grid still renders
 */
export function ProjectStoryboard({
  projectId,
  initialPayload,
  userDemos,
  className,
}: ProjectStoryboardProps) {
  const [payload, setPayload] = useState<StoryboardPayload | null>(
    initialPayload ?? null
  );
  const [loading, setLoading] = useState(initialPayload === undefined);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 4 — resolve user demos once per render and compute the render
  // mode used by Card 6 + the merge helper.
  const renderMode: DemoRenderMode = userDemos && userDemos.length > 0
    ? toRenderMode(userDemos.map(resolveDemo))
    : { kind: "none" };

  const mergedPayload: StoryboardPayload | null = payload
    ? applyUserDemoToStoryboard(payload, renderMode)
    : null;

  const fetchStoryboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard`);
      if (res.status === 404) {
        setPayload(null);
        return;
      }
      if (!res.ok) {
        setError("Failed to load Guided Tour");
        return;
      }
      const json = await res.json();
      const parsed = storyboardPayloadSchema.safeParse(json.storyboard);
      if (parsed.success) {
        setPayload(parsed.data);
      } else {
        setError("Guided Tour data is malformed");
      }
    } catch {
      setError("Network error loading Guided Tour");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (initialPayload === undefined) {
      fetchStoryboard();
    }
  }, [fetchStoryboard, initialPayload]);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/storyboard/regenerate`,
        { method: "POST" }
      );
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setError(
          `Try again in ${body.retryAfterSeconds ?? 30}s`
        );
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Regeneration failed");
        return;
      }
      const body = await res.json();
      const parsed = storyboardPayloadSchema.safeParse(body.storyboard);
      if (parsed.success) setPayload(parsed.data);
    } catch {
      setError("Network error");
    } finally {
      setRegenerating(false);
    }
  }, [projectId]);

  return (
    <Card className={cn(className)} data-testid="project-storyboard">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4" />
            Guided Tour
          </CardTitle>
          <CardDescription>
            A six-card scan of this project — each claim is re-checked against
            the repo.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={regenerate}
          disabled={regenerating || loading}
          className="gap-1.5"
        >
          <RotateCw
            className={cn("h-3.5 w-3.5", regenerating && "animate-spin")}
          />
          {regenerating ? "Regenerating…" : "Regenerate"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingGrid />
        ) : !mergedPayload ? (
          <EmptyState onRegenerate={regenerate} regenerating={regenerating} />
        ) : (
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
              regenerating && "opacity-70 pointer-events-none"
            )}
            data-testid="storyboard-grid"
          >
            {mergedPayload.cards.map((card) => (
              <StoryboardCard
                key={card.id}
                card={card}
                slotBelow={cardSlotBelow(card, mergedPayload.mermaid)}
                demoRenderMode={card.id === "try_it" ? renderMode : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Supporting views ───────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      data-testid="storyboard-loading"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-lg border bg-muted/30"
        />
      ))}
    </div>
  );
}

function EmptyState({
  onRegenerate,
  regenerating,
}: {
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-md border border-dashed py-8 text-center"
      data-testid="storyboard-empty"
    >
      <Sparkles className="h-6 w-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          Guided Tour hasn&apos;t been generated yet
        </p>
        <p className="text-xs text-muted-foreground">
          The tour pulls a 6-card summary from the repo. It takes ~10 seconds.
        </p>
      </div>
      <Button
        onClick={onRegenerate}
        disabled={regenerating}
        size="sm"
        className="gap-1.5"
      >
        {regenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
          </>
        ) : (
          "Generate now"
        )}
      </Button>
    </div>
  );
}
