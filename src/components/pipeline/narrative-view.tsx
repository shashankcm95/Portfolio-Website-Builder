"use client";

import { useCallback, useState } from "react";
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

/**
 * Simple inline claim highlighting. Wraps sentences with verification
 * markers in colored indicators. This is a client-side approximation;
 * in a real implementation the claim map would provide precise indices.
 */
function renderContentWithClaims(content: string): React.ReactNode {
  // Split by sentences (simplified). Each sentence can have an inline
  // verification marker like [verified], [unverified], or [flagged].
  const parts = content.split(/(\[verified\]|\[unverified\]|\[flagged\])/g);

  if (parts.length === 1) {
    // No inline markers, render as plain text paragraphs
    return content.split("\n\n").map((paragraph, i) => (
      <p key={i} className="text-sm leading-relaxed">
        {paragraph}
      </p>
    ));
  }

  const elements: React.ReactNode[] = [];
  let currentVerification: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === "[verified]") {
      currentVerification = "verified";
      continue;
    }
    if (part === "[unverified]") {
      currentVerification = "unverified";
      continue;
    }
    if (part === "[flagged]") {
      currentVerification = "flagged";
      continue;
    }

    if (!part.trim()) continue;

    if (currentVerification) {
      elements.push(
        <span
          key={i}
          className={cn(
            "inline",
            currentVerification === "verified" &&
              "border-l-2 border-green-400 pl-1",
            currentVerification === "unverified" &&
              "border-l-2 border-yellow-400 pl-1",
            currentVerification === "flagged" &&
              "border-l-2 border-red-400 pl-1"
          )}
        >
          {part}
          <ClaimIndicator type={currentVerification} />
        </span>
      );
      currentVerification = null;
    } else {
      elements.push(<span key={i}>{part}</span>);
    }
  }

  return <div className="text-sm leading-relaxed space-y-1">{elements}</div>;
}

function ClaimIndicator({ type }: { type: string }) {
  switch (type) {
    case "verified":
      return (
        <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-green-500" />
      );
    case "unverified":
      return (
        <AlertCircle className="ml-1 inline h-3.5 w-3.5 text-yellow-500" />
      );
    case "flagged":
      return <XCircle className="ml-1 inline h-3.5 w-3.5 text-red-500" />;
    default:
      return null;
  }
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function SectionEditor({
  section,
  projectId,
  onSaved,
}: {
  section: Section;
  projectId: string;
  onSaved: (updatedSection: Section) => void;
}) {
  const displayContent = section.isUserEdited && section.userContent
    ? section.userContent
    : section.content;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(displayContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
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
        throw new Error("Failed to save changes");
      }

      onSaved({
        ...section,
        isUserEdited: true,
        userContent: editContent,
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save section:", err);
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      {isEditing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
        />
      ) : (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {renderContentWithClaims(displayContent)}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NarrativeView({ projectId, sections }: NarrativeViewProps) {
  const [localSections, setLocalSections] = useState<Section[]>(sections);
  const [variantFilter, setVariantFilter] = useState<VariantFilter>("recruiter");

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
            Verified claim
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
            Unverified claim
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            Flagged claim
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
                  onSaved={handleSectionSaved}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
