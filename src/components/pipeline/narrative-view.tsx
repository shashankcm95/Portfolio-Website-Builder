"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Pencil,
  Save,
  X,
  Eye,
  Users,
  Code2,
  ChevronDown,
  ChevronRight,
  FileCode,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  sectionType: string;
  variant: string;
  content: string;
  isUserEdited: boolean;
  userContent?: string;
}

interface NarrativeViewProps {
  projectId: string;
  sections: Section[];
}

type VariantFilter = "recruiter" | "engineer";

interface ClaimRow {
  id: string;
  sentenceIndex: number;
  sentenceText: string;
  factIds: string[];
  verification: string;
  confidence: number | null;
}

interface FactRow {
  id: string;
  claim: string;
  category: string;
  confidence: number;
  evidenceType: string;
  evidenceRef: string | null;
  evidenceText: string | null;
}

interface ClaimMapData {
  claimsBySection: Record<string, ClaimRow[]>;
  facts: FactRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTION_TYPE_LABELS: Record<string, string> = {
  summary: "Summary",
  architecture: "Architecture",
  tech_narrative: "Tech Narrative",
  recruiter_pitch: "Recruiter Pitch",
  engineer_deep_dive: "Engineer Deep Dive",
};

const SECTION_TYPE_ORDER = [
  "summary",
  "architecture",
  "tech_narrative",
  "recruiter_pitch",
  "engineer_deep_dive",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function VerificationIcon({ type }: { type: string }) {
  const className = "h-3.5 w-3.5 shrink-0";
  switch (type) {
    case "verified":
      return <CheckCircle2 className={cn(className, "text-green-500")} />;
    case "unverified":
      return <AlertCircle className={cn(className, "text-yellow-500")} />;
    case "flagged":
      return <XCircle className={cn(className, "text-red-500")} />;
    default:
      return null;
  }
}

function verificationLabel(type: string): string {
  switch (type) {
    case "verified":
      return "Backed by evidence";
    case "unverified":
      return "No direct evidence found";
    case "flagged":
      return "Conflicts with evidence";
    default:
      return type;
  }
}

function borderClass(type: string): string {
  switch (type) {
    case "verified":
      return "border-l-green-400";
    case "unverified":
      return "border-l-yellow-400";
    case "flagged":
      return "border-l-red-400";
    default:
      return "border-l-muted";
  }
}

/**
 * Renders section content using real claim-map rows. Each claim row's
 * sentenceText becomes its own clickable block that expands to show the
 * backing facts from the project's fact store.
 *
 * Falls back to plain paragraphs if no claim rows exist for this section
 * yet (e.g., claim_verify step not run, or user is viewing a manual edit
 * before re-verification).
 */
function ClaimAwareContent({
  content,
  claims,
  facts,
}: {
  content: string;
  claims: ClaimRow[] | undefined;
  facts: FactRow[];
}) {
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

  if (!claims || claims.length === 0) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        {content.split("\n\n").map((paragraph, i) => (
          <p key={i} className="text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  // Build an index: factIds in claim_map are 1-based positional refs into
  // the facts list the LLM saw during verification (ordered by createdAt).
  const factByIndex = new Map<string, FactRow>();
  facts.forEach((f, i) => factByIndex.set(String(i + 1), f));

  return (
    <div className="space-y-2">
      {claims.map((claim) => {
        const isExpanded = expandedClaimId === claim.id;
        const linkedFacts = claim.factIds
          .map((idx) => factByIndex.get(idx))
          .filter((f): f is FactRow => f != null);

        return (
          <div
            key={claim.id}
            className={cn(
              "rounded-md border-l-2 bg-muted/20",
              borderClass(claim.verification)
            )}
          >
            <button
              type="button"
              onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-md"
              aria-expanded={isExpanded}
              title={verificationLabel(claim.verification)}
            >
              <VerificationIcon type={claim.verification} />
              <span className="flex-1 text-sm leading-relaxed">
                {claim.sentenceText}
              </span>
              {linkedFacts.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 pt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {linkedFacts.length} source{linkedFacts.length === 1 ? "" : "s"}
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground pt-2">
                  {verificationLabel(claim.verification)}
                  {claim.confidence != null && (
                    <span className="ml-2 normal-case">
                      · confidence {Math.round(claim.confidence * 100)}%
                    </span>
                  )}
                </p>
                {linkedFacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No backing facts recorded for this claim.
                  </p>
                ) : (
                  linkedFacts.map((fact) => (
                    <div
                      key={fact.id}
                      className="rounded border bg-background p-2.5 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                        >
                          {fact.category}
                        </Badge>
                        <p className="text-xs font-medium">{fact.claim}</p>
                      </div>
                      {fact.evidenceRef && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <FileCode className="h-3 w-3" />
                          <span className="font-mono">{fact.evidenceRef}</span>
                        </div>
                      )}
                      {fact.evidenceText && (
                        <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-snug">
                          {fact.evidenceText}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function SectionEditor({
  section,
  projectId,
  claims,
  facts,
  onSaved,
  onRegenerated,
}: {
  section: Section;
  projectId: string;
  claims: ClaimRow[] | undefined;
  facts: FactRow[];
  onSaved: (updatedSection: Section) => void;
  onRegenerated: (updatedSection: Section) => void;
}) {
  const displayContent = section.isUserEdited && section.userContent
    ? section.userContent
    : section.content;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(displayContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sections/${section.id}/regenerate`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Regenerate failed (${res.status})`);
      }
      const { section: updatedSection } = await res.json();
      onRegenerated(updatedSection);
      setEditContent(updatedSection.content);
      setConfirmRegen(false);
    } catch (err) {
      setRegenError(
        err instanceof Error ? err.message : "Failed to regenerate section"
      );
    } finally {
      setIsRegenerating(false);
    }
  }, [projectId, section.id, onRegenerated]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sections/${section.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userContent: editContent }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }

      onSaved({
        ...section,
        isUserEdited: true,
        userContent: editContent,
      });
      setIsEditing(false);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save changes"
      );
    } finally {
      setIsSaving(false);
    }
  }, [editContent, projectId, section, onSaved]);

  const handleCancel = useCallback(() => {
    setEditContent(displayContent);
    setIsEditing(false);
  }, [displayContent]);

  return (
    <div className="space-y-3">
      {/* Header with edit controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {section.isUserEdited && (
            <Badge variant="secondary" className="text-[10px]">
              Edited
            </Badge>
          )}
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (section.isUserEdited) {
                    setConfirmRegen(true);
                  } else {
                    handleRegenerate();
                  }
                }}
                disabled={isRegenerating}
                title="Regenerate just this section using cached facts"
              >
                {isRegenerating ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                )}
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                disabled={isRegenerating}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Regenerate confirmation (only shown when overwriting user edits) */}
      {confirmRegen && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              This section has your edits. Regenerating will overwrite them.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Overwrite &amp; Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRegen(false)}
                disabled={isRegenerating}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Save / regenerate error banners */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{saveError}</p>
        </div>
      )}
      {regenError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{regenError}</p>
        </div>
      )}

      {/* Content area */}
      {isEditing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
        />
      ) : (
        <ClaimAwareContent
          content={displayContent}
          claims={claims}
          facts={facts}
        />
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NarrativeView({ projectId, sections }: NarrativeViewProps) {
  const [localSections, setLocalSections] = useState<Section[]>(sections);
  const [variantFilter, setVariantFilter] = useState<VariantFilter>("recruiter");
  const [claimData, setClaimData] = useState<ClaimMapData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/claim-map`);
        if (!res.ok) return;
        const data: ClaimMapData = await res.json();
        if (!cancelled) setClaimData(data);
      } catch {
        // Non-fatal — the UI falls back to plain paragraphs
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Get unique section types, preserving defined order
  const sectionTypes = Array.from(
    new Set(localSections.map((s) => s.sectionType))
  ).sort((a, b) => {
    const aIdx = SECTION_TYPE_ORDER.indexOf(a);
    const bIdx = SECTION_TYPE_ORDER.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.localeCompare(b);
  });

  // Filter sections by variant
  const filteredSections = localSections.filter(
    (s) => s.variant === variantFilter
  );

  // If no sections match the current filter, show all
  const displaySections =
    filteredSections.length > 0 ? filteredSections : localSections;

  const displaySectionTypes = Array.from(
    new Set(displaySections.map((s) => s.sectionType))
  ).sort((a, b) => {
    const aIdx = SECTION_TYPE_ORDER.indexOf(a);
    const bIdx = SECTION_TYPE_ORDER.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.localeCompare(b);
  });

  const defaultTab = displaySectionTypes[0] ?? "summary";

  // Check if both variants exist
  const hasRecruiterVariant = localSections.some(
    (s) => s.variant === "recruiter"
  );
  const hasEngineerVariant = localSections.some(
    (s) => s.variant === "engineer"
  );
  const showVariantToggle = hasRecruiterVariant && hasEngineerVariant;

  function handleSectionSaved(updatedSection: Section) {
    setLocalSections((prev) =>
      prev.map((s) => (s.id === updatedSection.id ? updatedSection : s))
    );
  }

  const refetchClaimMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/claim-map`);
      if (!res.ok) return;
      const data: ClaimMapData = await res.json();
      setClaimData(data);
    } catch {
      // Non-fatal
    }
  }, [projectId]);

  function handleSectionRegenerated(updatedSection: Section) {
    setLocalSections((prev) =>
      prev.map((s) => (s.id === updatedSection.id ? updatedSection : s))
    );
    // Claim-map rows were replaced server-side — refetch so the UI reflects
    // the new evidence-backing for the regenerated content.
    refetchClaimMap();
  }

  if (localSections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generated Narratives</CardTitle>
          <CardDescription>
            No narratives generated yet. Run the analysis pipeline first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Eye className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Narratives will appear here after the pipeline completes.
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
            <CardTitle className="text-lg">Generated Narratives</CardTitle>
            <CardDescription>
              AI-generated narratives with claim verification indicators.
            </CardDescription>
          </div>

          {/* Variant toggle */}
          {showVariantToggle && (
            <div className="flex items-center rounded-md border">
              <Button
                variant={variantFilter === "recruiter" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setVariantFilter("recruiter")}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Recruiter
              </Button>
              <Button
                variant={variantFilter === "engineer" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setVariantFilter("engineer")}
              >
                <Code2 className="mr-1.5 h-3.5 w-3.5" />
                Engineer
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Verification legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Backed by evidence
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
            No direct evidence
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            Conflicts with evidence
          </span>
          <span className="ml-auto text-[11px] italic">
            Click any claim to see the code evidence.
          </span>
        </div>

        <Separator className="mb-4" />

        {/* Section tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full flex-wrap h-auto gap-1 justify-start">
            {displaySectionTypes.map((type) => (
              <TabsTrigger key={type} value={type}>
                {SECTION_TYPE_LABELS[type] ?? type}
              </TabsTrigger>
            ))}
          </TabsList>

          {displaySectionTypes.map((type) => {
            const section = displaySections.find(
              (s) => s.sectionType === type
            );
            if (!section) return null;

            return (
              <TabsContent key={type} value={type}>
                <SectionEditor
                  section={section}
                  projectId={projectId}
                  claims={claimData?.claimsBySection[section.id]}
                  facts={claimData?.facts ?? []}
                  onSaved={handleSectionSaved}
                  onRegenerated={handleSectionRegenerated}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
