"use client";

/**
 * Phase 10 — Track F. Inline editor for a single extracted fact.
 *
 * Rendered in-place inside <FactList> when the owner clicks the pencil
 * icon on a row. Supports editing `claim` (textarea, 1..500), `category`
 * (select, falls back to free-form text), and `confidence` (0..1 slider).
 * Save is optimistic — the parent's `onSaved` receives the updated row
 * from the API so it can replace the stale one.
 */

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface FactEditInlineProps {
  portfolioId: string;
  projectId: string;
  factId: string;
  initialClaim: string;
  initialCategory: string;
  initialConfidence: number;
  /** Category options to show in the select. Extra values are still
   *  acceptable since the schema stores category as free-form text. */
  categoryOptions?: string[];
  onSaved: (next: {
    id: string;
    claim: string;
    category: string;
    confidence: number;
    ownerEdited: boolean;
  }) => void;
  onCancel: () => void;
}

const DEFAULT_CATEGORIES = [
  "tech_stack",
  "architecture",
  "feature",
  "metric",
  "methodology",
  "role",
];

export function FactEditInline({
  portfolioId,
  projectId,
  factId,
  initialClaim,
  initialCategory,
  initialConfidence,
  categoryOptions,
  onSaved,
  onCancel,
}: FactEditInlineProps) {
  const [claim, setClaim] = useState(initialClaim);
  const [category, setCategory] = useState(initialCategory);
  const [confidence, setConfidence] = useState(initialConfidence);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = Array.from(
    new Set([...(categoryOptions ?? DEFAULT_CATEGORIES), initialCategory])
  );

  const save = async () => {
    setError(null);
    const trimmedClaim = claim.trim();
    if (trimmedClaim.length < 1 || trimmedClaim.length > 500) {
      setError("Claim must be 1..500 characters.");
      return;
    }
    if (category.trim().length === 0) {
      setError("Category is required.");
      return;
    }
    if (confidence < 0 || confidence > 1) {
      setError("Confidence must be between 0 and 1.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/${projectId}/facts/${factId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim: trimmedClaim,
            category: category.trim(),
            confidence,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Save failed");
        return;
      }
      const data = (await res.json()) as {
        fact: {
          id: string;
          claim: string;
          category: string;
          confidence: number;
          ownerEdited: boolean;
        };
      };
      onSaved({
        id: data.fact.id,
        claim: data.fact.claim,
        category: data.fact.category,
        confidence: data.fact.confidence,
        ownerEdited: data.fact.ownerEdited,
      });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-3 rounded-md border bg-muted/20 p-3"
      data-testid="fact-edit-inline"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`fact-claim-${factId}`} className="text-xs">
          Claim
        </Label>
        <textarea
          id={`fact-claim-${factId}`}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={saving}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="fact-claim-input"
        />
        <p className="text-right text-[10px] text-muted-foreground">
          {claim.length} / 500
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`fact-category-${factId}`} className="text-xs">
            Category
          </Label>
          <select
            id={`fact-category-${factId}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="fact-category-select"
          >
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`fact-confidence-${factId}`} className="text-xs">
            Confidence: {Math.round(confidence * 100)}%
          </Label>
          <input
            id={`fact-confidence-${factId}`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            disabled={saving}
            className="w-full"
            data-testid="fact-confidence-slider"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          data-testid="fact-edit-save"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
          data-testid="fact-edit-cancel"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
