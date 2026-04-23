"use client";

/**
 * Phase C — Identity & pitch editor.
 *
 * All Tier-1 portfolio-level fields in one card:
 *   - Positioning one-liner (text input, 10-140 chars)
 *   - Named employers (tag list)
 *   - Hire status (select) + optional CTA copy + link
 *   - Anchor stat override (value/unit, optional context) — Tier-3
 *     surface here is intentionally minimal: power users can type a
 *     specific override in, but the "Clear" button reverts to the
 *     pipeline-derived pick from profile-data.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Sparkles,
  X,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CTA_TEXT_MAX,
  EMPLOYER_LIST_MAX,
  EMPLOYER_MAX,
  POSITIONING_MAX,
  POSITIONING_MIN,
} from "@/lib/identity/validation";

interface AnchorStat {
  value: string;
  unit: string;
  context?: string;
  sourceRef?: string;
}

interface IdentityState {
  positioning: string | null;
  namedEmployers: string[];
  hireStatus: "available" | "open" | "not-looking";
  hireCtaText: string | null;
  hireCtaHref: string | null;
  anchorStatOverride: AnchorStat | null;
}

interface IdentityPitchCardProps {
  portfolioId: string;
}

const HIRE_STATUS_OPTIONS: Array<{
  value: IdentityState["hireStatus"];
  label: string;
  hint: string;
}> = [
  {
    value: "available",
    label: "Available — hiring me ends up on the hero",
    hint: "Shows a prominent CTA and status chip across templates.",
  },
  {
    value: "open",
    label: "Open to conversations",
    hint: "Mutes the CTA but keeps the signal visible.",
  },
  {
    value: "not-looking",
    label: "Not looking",
    hint: "No CTA or status is rendered.",
  },
];

function emptyState(): IdentityState {
  return {
    positioning: null,
    namedEmployers: [],
    hireStatus: "not-looking",
    hireCtaText: null,
    hireCtaHref: null,
    anchorStatOverride: null,
  };
}

export function IdentityPitchCard({ portfolioId }: IdentityPitchCardProps) {
  const [state, setState] = useState<IdentityState>(emptyState);
  // Phase R4 — `cleanState` mirrors the last snapshot known to be
  // persisted on the server. Comparing against `state` (via
  // canonical-JSON) gives us a dirty flag we use to render an
  // unsaved-changes dot next to the card title and to gate the
  // beforeunload warning. Refreshed on every successful load / save.
  const [cleanState, setCleanState] = useState<IdentityState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // ─── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portfolios/${portfolioId}/identity`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const id = data.identity ?? {};
        if (cancelled) return;
        const loadedState: IdentityState = {
          positioning: id.positioning ?? null,
          namedEmployers: Array.isArray(id.namedEmployers)
            ? id.namedEmployers
            : [],
          hireStatus: id.hireStatus ?? "not-looking",
          hireCtaText: id.hireCtaText ?? null,
          hireCtaHref: id.hireCtaHref ?? null,
          anchorStatOverride: id.anchorStatOverride ?? null,
        };
        setState(loadedState);
        setCleanState(loadedState);
      } catch (err) {
        if (!cancelled) {
          setMessage({
            kind: "err",
            text:
              err instanceof Error
                ? `Failed to load: ${err.message}`
                : "Failed to load identity.",
          });
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const positioningLength = state.positioning?.trim().length ?? 0;
  const positioningValid =
    positioningLength === 0 ||
    (positioningLength >= POSITIONING_MIN &&
      positioningLength <= POSITIONING_MAX);

  // Phase R4 — dirty-flag via canonical JSON comparison. Cheap for the
  // small object we hold here; avoids writing a field-by-field diff
  // that would drift as the shape grows.
  const isDirty = useMemo(
    () => loaded && JSON.stringify(state) !== JSON.stringify(cleanState),
    [loaded, state, cleanState]
  );

  // Phase R4 — beforeunload warning. Triggers the browser's native
  // "changes you made may not be saved" dialog only when the form is
  // dirty; saved + pristine states navigate freely. Attaches once per
  // dirty transition and cleans up on unmount or when clean again.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need a returnValue; modern ones ignore the text.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const addEmployer = useCallback((raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setState((s) => {
      if (s.namedEmployers.length >= EMPLOYER_LIST_MAX) return s;
      if (s.namedEmployers.includes(name)) return s;
      return { ...s, namedEmployers: [...s.namedEmployers, name] };
    });
  }, []);

  const removeEmployer = useCallback((idx: number) => {
    setState((s) => ({
      ...s,
      namedEmployers: s.namedEmployers.filter((_, i) => i !== idx),
    }));
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Send everything we hold locally. The API merges on the server side;
      // sending the full state ensures clears (e.g. user removed all
      // employers) actually persist.
      const body = {
        positioning:
          state.positioning && state.positioning.trim().length > 0
            ? state.positioning.trim()
            : null,
        namedEmployers: state.namedEmployers,
        hireStatus: state.hireStatus,
        hireCtaText:
          state.hireCtaText && state.hireCtaText.trim().length > 0
            ? state.hireCtaText.trim()
            : null,
        hireCtaHref:
          state.hireCtaHref && state.hireCtaHref.trim().length > 0
            ? state.hireCtaHref.trim()
            : null,
        anchorStatOverride: state.anchorStatOverride,
      };
      const res = await fetch(`/api/portfolios/${portfolioId}/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.issues?.[0]?.message || err?.error || `HTTP ${res.status}`
        );
      }
      // Phase R4 — refresh the dirty-state baseline to the body we just
      // persisted. `body` is the canonical shape we posted; the server
      // echoes it back, but using `body` keeps the success path
      // synchronous-looking even if the response parse were to fail.
      setCleanState({
        positioning: body.positioning,
        namedEmployers: body.namedEmployers,
        hireStatus: body.hireStatus,
        hireCtaText: body.hireCtaText,
        hireCtaHref: body.hireCtaHref,
        anchorStatOverride: body.anchorStatOverride,
      });
      setMessage({ kind: "ok", text: "Saved. Republish to go live." });
    } catch (err) {
      setMessage({
        kind: "err",
        text:
          err instanceof Error ? err.message : "Save failed, please retry.",
      });
    } finally {
      setSaving(false);
    }
  }, [portfolioId, state]);

  const canSave = loaded && positioningValid && !saving;

  // Show the hire-copy fields only when there's actually a CTA to write.
  const showCtaFields = state.hireStatus !== "not-looking";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-4 w-4" />
          Identity &amp; pitch
          {/* Phase R4 — dirty-state dot. A warning-tone pulse tells the
              owner they have edits that haven't been persisted yet. We
              keep the copy out of the title itself (just the dot) so
              the heading stays readable at a glance. */}
          {isDirty && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-amber-500"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </CardTitle>
        <CardDescription>
          The hero copy, named employers, and hiring signal your portfolio leads
          with. All Tier-1 edits — your own words about yourself.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!loaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {loaded && (
          <>
            {/* ── Positioning ───────────────────────────────────────────── */}
            <PositioningField
              value={state.positioning ?? ""}
              onChange={(v) => setState((s) => ({ ...s, positioning: v }))}
              length={positioningLength}
              valid={positioningValid}
            />

            {/* ── Named employers ──────────────────────────────────────── */}
            <EmployersField
              items={state.namedEmployers}
              onAdd={addEmployer}
              onRemove={removeEmployer}
            />

            <Separator />

            {/* ── Hire status ──────────────────────────────────────────── */}
            <div className="space-y-3">
              <Label>Hiring status</Label>
              <div className="grid gap-2">
                {HIRE_STATUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                      state.hireStatus === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="hireStatus"
                      className="mt-1"
                      checked={state.hireStatus === opt.value}
                      onChange={() =>
                        setState((s) => ({ ...s, hireStatus: opt.value }))
                      }
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.hint}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {showCtaFields && (
                <div className="grid gap-3 pt-2 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cta-text">CTA text</Label>
                    <Input
                      id="cta-text"
                      placeholder="Let's talk about work"
                      maxLength={CTA_TEXT_MAX}
                      value={state.hireCtaText ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          hireCtaText: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the template's default wording.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cta-href">CTA link</Label>
                    <Input
                      id="cta-href"
                      placeholder="mailto:you@example.com"
                      value={state.hireCtaHref ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          hireCtaHref: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Mailto, https URL, or a relative path like /contact.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* ── Anchor stat override ─────────────────────────────────── */}
            <AnchorOverrideField
              override={state.anchorStatOverride}
              onChange={(next) =>
                setState((s) => ({ ...s, anchorStatOverride: next }))
              }
            />
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-4">
        {message ? (
          <span
            className={`flex items-center gap-1.5 text-sm ${
              message.kind === "ok" ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {message.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {message.text}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isDirty
              ? "Unsaved changes — click Save to persist them, then Republish to go live."
              : "Changes persist on save but don't reach the live site until you republish."}
          </span>
        )}
        <Button onClick={onSave} disabled={!canSave}>
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
      </CardFooter>
    </Card>
  );
}

// ─── Sub-fields ──────────────────────────────────────────────────────────────

function PositioningField({
  value,
  onChange,
  length,
  valid,
}: {
  value: string;
  onChange: (v: string) => void;
  length: number;
  valid: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="positioning">Positioning one-liner</Label>
        <span
          className={`text-xs ${
            valid || length === 0
              ? "text-muted-foreground"
              : "text-destructive"
          }`}
        >
          {length}/{POSITIONING_MAX}
        </span>
      </div>
      <Input
        id="positioning"
        placeholder="I build accessible, pixel-perfect experiences for the web"
        maxLength={POSITIONING_MAX + 20}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        One sharp sentence. Replaces the generic resume label in the hero.
        {length > 0 && length < POSITIONING_MIN && (
          <span className="text-destructive">
            {" "}
            Add a few more characters ({POSITIONING_MIN} minimum).
          </span>
        )}
      </p>
    </div>
  );
}

function EmployersField({
  items,
  onAdd,
  onRemove,
}: {
  items: string[];
  onAdd: (raw: string) => void;
  onRemove: (idx: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const full = items.length >= EMPLOYER_LIST_MAX;

  const commit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="employer-input">Named employers / clients</Label>
      <div className="flex flex-wrap gap-2">
        {items.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
          >
            {name}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-muted-foreground transition hover:text-destructive"
              aria-label={`Remove ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id="employer-input"
          placeholder="Apple"
          maxLength={EMPLOYER_MAX}
          disabled={full}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={commit}
          disabled={full || draft.trim().length === 0}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add. Up to {EMPLOYER_LIST_MAX} entries.
        Templates render these as a "Previously at" line in the hero.
      </p>
    </div>
  );
}

function AnchorOverrideField({
  override,
  onChange,
}: {
  override: AnchorStat | null;
  onChange: (next: AnchorStat | null) => void;
}) {
  const enabled = override !== null;
  // Local drafts avoid clearing the form when the user temporarily sets
  // a field to empty. Only commit to parent state on blur / non-empty.
  const [draft, setDraft] = useState<AnchorStat>(
    override ?? { value: "", unit: "" }
  );

  useEffect(() => {
    setDraft(override ?? { value: "", unit: "" });
  }, [override]);

  const canCommit = useMemo(
    () => draft.value.trim().length > 0 && draft.unit.trim().length > 0,
    [draft]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Anchor stat override</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The single strongest credential the hero leads with. Leave unset
            to let the pipeline pick the best candidate (stars, outcomes,
            named employers).
          </p>
        </div>
        {enabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Clear override
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="anchor-value">Value</Label>
          <Input
            id="anchor-value"
            placeholder="4k+"
            maxLength={30}
            value={draft.value}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            onBlur={() => {
              if (canCommit) onChange(draft);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="anchor-unit">Unit</Label>
          <Input
            id="anchor-unit"
            placeholder="GitHub stars"
            maxLength={60}
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
            onBlur={() => {
              if (canCommit) onChange(draft);
            }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="anchor-context">Context (optional)</Label>
        <Input
          id="anchor-context"
          placeholder="on text-to-handwriting"
          maxLength={140}
          value={draft.context ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, context: e.target.value }))
          }
          onBlur={() => {
            if (canCommit) onChange(draft);
          }}
        />
      </div>
    </div>
  );
}
