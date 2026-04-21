"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Filter,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FactEditInline } from "@/components/pipeline/fact-edit-inline";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Fact {
  id: string;
  claim: string;
  category: string;
  confidence: number;
  evidenceType: string;
  evidenceRef: string;
  evidenceText: string;
  isVerified: boolean;
  /** Phase 10 — Track F. True once the owner has edited claim/category/
   *  confidence via the inline editor. */
  ownerEdited?: boolean;
}

interface FactListProps {
  facts: Fact[];
  /** Phase 10 — Track F. Required for inline editing to wire the PATCH
   *  endpoint. When either is omitted, the pencil-edit UI is hidden. */
  portfolioId?: string;
  projectId?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  tech_stack: "Tech Stack",
  architecture: "Architecture",
  feature: "Features",
  metric: "Metrics",
  methodology: "Methodology",
  role: "Role & Contributions",
};

const CATEGORY_ORDER = [
  "tech_stack",
  "architecture",
  "feature",
  "metric",
  "methodology",
  "role",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfidenceLevel(confidence: number): {
  label: string;
  variant: "default" | "secondary" | "destructive";
} {
  if (confidence >= 0.8) {
    return { label: "High", variant: "default" };
  }
  if (confidence >= 0.5) {
    return { label: "Medium", variant: "secondary" };
  }
  return { label: "Low", variant: "destructive" };
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function FactItem({
  fact,
  portfolioId,
  projectId,
  onSaved,
}: {
  fact: Fact;
  portfolioId?: string;
  projectId?: string;
  onSaved?: (next: Fact) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { label: confidenceLabel, variant: confidenceVariant } =
    getConfidenceLevel(fact.confidence);

  const canEdit = !!portfolioId && !!projectId && !!onSaved;

  if (isEditing && canEdit) {
    return (
      <div className="rounded-md border bg-background p-1">
        <FactEditInline
          portfolioId={portfolioId!}
          projectId={projectId!}
          factId={fact.id}
          initialClaim={fact.claim}
          initialCategory={fact.category}
          initialConfidence={fact.confidence}
          onSaved={(next) => {
            onSaved!({ ...fact, ...next });
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="group rounded-md border bg-background">
      <div className="flex w-full items-start gap-3 p-3 text-left">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? "Collapse fact" : "Expand fact"}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Claim text */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm">{fact.claim}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={confidenceVariant} className="text-[10px]">
              {confidenceLabel} ({Math.round(fact.confidence * 100)}%)
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {fact.evidenceType}
            </Badge>
            {fact.isVerified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </span>
            )}
            {fact.ownerEdited && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300"
                data-testid="fact-owner-edited-chip"
              >
                edited by owner
              </span>
            )}
          </div>
        </button>

        {/* Pencil edit icon (visible on hover when editing is wired up) */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            aria-label="Edit fact"
            data-testid={`fact-edit-${fact.id}`}
            className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Collapsible evidence section */}
      {isExpanded && (
        <div className="border-t px-3 py-2.5 pl-10">
          {fact.evidenceRef && (
            <div className="mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Source:{" "}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {fact.evidenceRef}
              </span>
            </div>
          )}
          {fact.evidenceText && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Evidence:
              </span>
              <p className="mt-1 rounded bg-muted/50 p-2 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                {fact.evidenceText}
              </p>
            </div>
          )}
          {!fact.evidenceRef && !fact.evidenceText && (
            <p className="text-xs text-muted-foreground italic">
              No evidence details available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  facts,
  portfolioId,
  projectId,
  onFactSaved,
}: {
  category: string;
  facts: Fact[];
  portfolioId?: string;
  projectId?: string;
  onFactSaved?: (next: Fact) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const label = CATEGORY_LABELS[category] ?? category;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2 py-2 text-left group"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary" className="text-[10px]">
          {facts.length}
        </Badge>
      </button>

      {!isCollapsed && (
        <div className="ml-2 space-y-2 pb-2">
          {facts.map((fact) => (
            <FactItem
              key={fact.id}
              fact={fact}
              portfolioId={portfolioId}
              projectId={projectId}
              onSaved={onFactSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FactList({ facts, portfolioId, projectId }: FactListProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  // Phase 10 — Track F. Mirror props into local state so inline edits can
  // patch a single row without round-tripping through the server. Keep
  // in sync when the parent replaces the list wholesale.
  const [localFacts, setLocalFacts] = useState<Fact[]>(facts);
  useEffect(() => {
    setLocalFacts(facts);
  }, [facts]);

  // Group facts by category
  const grouped = useMemo(() => {
    const groups: Record<string, Fact[]> = {};
    for (const fact of localFacts) {
      if (!groups[fact.category]) {
        groups[fact.category] = [];
      }
      groups[fact.category].push(fact);
    }
    return groups;
  }, [localFacts]);

  const handleFactSaved = (next: Fact) => {
    setLocalFacts((prev) =>
      prev.map((f) => (f.id === next.id ? { ...f, ...next } : f))
    );
  };

  // Available categories (sorted by defined order, then alphabetical)
  const categories = useMemo(() => {
    const available = Object.keys(grouped);
    return available.sort((a, b) => {
      const aIdx = CATEGORY_ORDER.indexOf(a);
      const bIdx = CATEGORY_ORDER.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [grouped]);

  // Filtered categories
  const visibleCategories = activeFilter
    ? categories.filter((c) => c === activeFilter)
    : categories;

  if (localFacts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Extracted Facts</CardTitle>
          <CardDescription>
            No facts have been extracted yet. Run the analysis pipeline first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CircleDot className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Facts will appear here after running the pipeline.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Extracted Facts</CardTitle>
            <CardDescription>
              {localFacts.length} facts extracted across {categories.length}{" "}
              categories
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={activeFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(null)}
          >
            All ({localFacts.length})
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeFilter === cat ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setActiveFilter(activeFilter === cat ? null : cat)
              }
            >
              {CATEGORY_LABELS[cat] ?? cat} ({grouped[cat].length})
            </Button>
          ))}
        </div>

        <Separator />

        {/* Grouped facts */}
        <div className="space-y-4">
          {visibleCategories.map((category) => (
            <CategoryGroup
              key={category}
              category={category}
              facts={grouped[category]}
              portfolioId={portfolioId}
              projectId={projectId}
              onFactSaved={handleFactSaved}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
