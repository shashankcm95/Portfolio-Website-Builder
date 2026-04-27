"use client";

/**
 * Phase E7 — Inline AI-suggestion panel for editor fields.
 *
 * Mounts under an empty (or any) editor field. One click on "Suggest
 * with AI" calls the per-portfolio `/api/portfolios/:id/suggest`
 * endpoint with the field name and renders 3 candidate strings.
 * Owners pick one with a "Use this" click; "Regenerate" re-rolls with
 * a new seed for variety.
 *
 * The component is generic over the suggestion type so the same
 * shell handles `string` (positioning, ctaText, ctaHref,
 * namedEmployers) and the structured `AnchorStatSuggestion`. Each
 * call site provides a `renderSuggestion` for how to display each
 * candidate and an `onUse` callback that converts the candidate into
 * a state update.
 */

import { useCallback, useState } from "react";
import { Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SuggestField } from "@/lib/identity/suggest/types";

interface SuggestPanelProps<T> {
  /** Portfolio whose context the suggestions key off. */
  portfolioId: string;
  /** Which editor field this panel populates. */
  field: SuggestField;
  /**
   * How to render each candidate's "card" content. The Use button is
   * provided by the panel; this only renders the value preview.
   */
  renderSuggestion: (s: T) => React.ReactNode;
  /** Called when the owner clicks "Use this" on a candidate. */
  onUse: (s: T) => void;
  /**
   * Optional copy override for the trigger button. Defaults to
   * "Suggest with AI" — a couple of fields prefer "Suggest employers"
   * etc. for clarity.
   */
  triggerLabel?: string;
  /** Tooltip / aria label for screen readers. */
  hint?: string;
}

interface SuggestPanelState<T> {
  loading: boolean;
  error: string | null;
  suggestions: T[];
  /** How many regenerate clicks have happened — used as the LLM seed. */
  seed: number;
  /** Whether the panel has been opened at least once. */
  opened: boolean;
}

export function SuggestPanel<T>({
  portfolioId,
  field,
  renderSuggestion,
  onUse,
  triggerLabel,
  hint,
}: SuggestPanelProps<T>) {
  const [state, setState] = useState<SuggestPanelState<T>>({
    loading: false,
    error: null,
    suggestions: [],
    seed: 0,
    opened: false,
  });

  const fetchSuggestions = useCallback(
    async (seed: number) => {
      setState((s) => ({ ...s, loading: true, error: null, opened: true }));
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/suggest`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field, seed, count: 3 }),
          }
        );
        if (!res.ok) {
          // Try to parse the JSON error body the route emits; fall
          // back to a generic message when the body isn't JSON
          // (e.g. an HTML error page from a proxy).
          let msg = `Request failed (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) msg = body.error;
          } catch {
            // ignore — keep generic
          }
          setState((s) => ({ ...s, loading: false, error: msg, suggestions: [] }));
          return;
        }
        const body = (await res.json()) as { suggestions: T[] };
        setState((s) => ({
          ...s,
          loading: false,
          error: null,
          suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
          seed,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          suggestions: [],
        }));
      }
    },
    [portfolioId, field]
  );

  // First-click handler. Sets seed=1 (we keep 0 reserved as "never
  // fetched") and opens the panel.
  const handleSuggest = () => fetchSuggestions(state.seed + 1);

  if (!state.opened) {
    return (
      <div className="flex items-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSuggest}
          aria-label={hint}
          title={hint}
          className="gap-1.5"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          {triggerLabel ?? "Suggest with AI"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Suggestions
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleSuggest}
          disabled={state.loading}
          className="gap-1.5 text-xs"
          aria-label="Regenerate suggestions"
        >
          {state.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Regenerate
        </Button>
      </div>

      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      {state.loading && state.suggestions.length === 0 && (
        <p className="text-xs text-muted-foreground">Generating…</p>
      )}

      {!state.error && state.suggestions.length > 0 && (
        <ul className="space-y-1.5">
          {state.suggestions.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-sm bg-background border border-border px-3 py-2"
            >
              <div className="flex-1 text-sm">{renderSuggestion(s)}</div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onUse(s)}
                className="text-xs"
              >
                Use this
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!state.loading && !state.error && state.suggestions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No suggestions returned. Try regenerating, or fill the field manually.
        </p>
      )}
    </div>
  );
}
