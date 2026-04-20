"use client";

import {
  Lightbulb,
  Network,
  FileCode,
  FlaskConical,
  Rocket,
  ExternalLink,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClaimChip } from "@/components/pipeline/claim-chip";
import { ArchitectureDiagram } from "@/components/pipeline/architecture-diagram";
import { DemoEmbed } from "@/components/projects/demo-embed";
import { SlideshowEmbed } from "@/components/projects/slideshow-embed";
import type { StoryboardCard as StoryboardCardModel } from "@/lib/ai/schemas/storyboard";
import type { DemoRenderMode } from "@/lib/demos/types";

interface StoryboardCardProps {
  card: StoryboardCardModel;
  /** Extra content slot — e.g., the architecture diagram for the "how" card. */
  slotBelow?: React.ReactNode;
  /**
   * Phase 4 — when this is Card 6 ("try_it") and the project has a
   * user-supplied demo, render `<ProjectDemo>` inline above the existing
   * URL/clone branches. For other cards this prop is ignored.
   */
  demoRenderMode?: DemoRenderMode;
  className?: string;
}

/**
 * One of the six fixed cards. The card renders its title, description,
 * claim chips, and any `extra` content (file snippet, demo link, clone
 * command). For Card 2 ("how"), `slotBelow` is used to inject the mermaid
 * architecture diagram.
 */
export function StoryboardCard({
  card,
  slotBelow,
  demoRenderMode,
  className,
}: StoryboardCardProps) {
  const Icon = iconFor(card.icon);
  const userDemoInline = renderUserDemoInline(card, demoRenderMode);
  return (
    <Card
      className={cn("flex h-full flex-col", className)}
      data-testid="storyboard-card"
      data-card-id={card.id}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md border bg-muted/50 p-1.5">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold leading-tight">{card.title}</h3>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        {card.claims.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {card.claims.map((c, i) => (
              <ClaimChip key={`${c.label}-${i}`} claim={c} />
            ))}
          </div>
        ) : (
          <span
            className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            data-testid="claim-placeholder"
          >
            Auto-verification unavailable
          </span>
        )}

        {slotBelow}

        {/* Phase 4 — user-supplied demo (only on Card 6). Rendered above the
         *   existing URL / clone-command branches so when both are present
         *   the embed shows first and the clone block sits beneath. */}
        {userDemoInline}

        {card.extra?.kind === "file_snippet" && (
          <div className="space-y-1.5" data-testid="file-snippet">
            <p className="text-[11px] font-mono text-muted-foreground">
              {card.extra.path}
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {card.extra.snippet}
            </pre>
          </div>
        )}

        {card.extra?.kind === "demo" && (
          <div className="space-y-1.5" data-testid="demo-extra">
            {card.extra.url ? (
              <Button asChild variant="outline" size="sm" className="w-fit gap-1">
                <a
                  href={card.extra.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open live demo
                </a>
              </Button>
            ) : null}
            {card.extra.cloneCommand && (
              <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                {card.extra.cloneCommand}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Icon resolution ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Lightbulb,
  Network,
  FileCode,
  FlaskConical,
  Rocket,
  ExternalLink,
};

function iconFor(name: string): LucideIcon {
  return ICON_MAP[name] ?? HelpCircle;
}

// ─── Helper for ProjectStoryboard: inject diagram for the "how" card ────────

export function cardSlotBelow(
  card: StoryboardCardModel,
  mermaidSource: string
): React.ReactNode | undefined {
  if (card.id === "how" && mermaidSource) {
    return <ArchitectureDiagram source={mermaidSource} />;
  }
  return undefined;
}

// ─── Phase 4 — user-demo inline renderer for Card 6 ─────────────────────────

/**
 * When Card 6 is `try_it` and the project has a user-supplied demo, render
 * it inline above the existing URL/clone-command branches. Single-mode →
 * `<DemoEmbed>`; slideshow → `<SlideshowEmbed>`. Returns null for any
 * other card OR when no demo is configured.
 */
function renderUserDemoInline(
  card: StoryboardCardModel,
  mode: DemoRenderMode | undefined
): React.ReactNode {
  if (card.id !== "try_it") return null;
  if (!mode || mode.kind === "none") return null;

  if (mode.kind === "single") {
    return <DemoEmbed demo={mode.demo} />;
  }
  return <SlideshowEmbed demos={mode.demos} />;
}
