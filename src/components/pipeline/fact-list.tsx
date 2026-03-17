"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Filter,
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
}

interface FactListProps {
  facts: Fact[];
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

function FactItem({ fact }: { fact: Fact }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { label: confidenceLabel, variant: confidenceVariant } =
    getConfidenceLevel(fact.confidence);

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {/* Expand/collapse icon */}
        <div className="mt-0.5 shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Claim text */}
        <div className="flex-1 min-w-0">
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
          </div>
        </div>
      </button>

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
}: {
  category: string;
  facts: Fact[];
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
            <FactItem key={fact.id} fact={fact} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FactList({ facts }: FactListProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Group facts by category
  const grouped = useMemo(() => {
    const groups: Record<string, Fact[]> = {};
    for (const fact of facts) {
      if (!groups[fact.category]) {
        groups[fact.category] = [];
      }
      groups[fact.category].push(fact);
    }
    return groups;
  }, [facts]);

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

  if (facts.length === 0) {
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
              {facts.length} facts extracted across {categories.length}{" "}
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
            All ({facts.length})
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
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
