"use client";

/**
 * Phase E8b — "Availability & preferences" editor card.
 *
 * Tier-1 universal recruiter signals — the binary filters that decide
 * whether a 30-second-budget recruiter (Sarah persona) stays on the
 * page or bounces. All fields are optional; absent fields render
 * nothing on the published site.
 *
 * Lives below `<IdentityPitchCard>` on the dashboard portfolio page.
 * Same PATCH endpoint as the other identity fields.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Loader2,
  Save,
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
import { SuggestPanel } from "@/components/portfolio/suggest-panel";

interface Availability {
  kind: "available_now" | "available_after" | "open_to_chat" | "not_looking";
  startDate?: string;
}

interface RoleTypes {
  ic?: boolean;
  manager?: boolean;
  fullTime?: boolean;
  contract?: boolean;
  remote?: boolean;
  hybrid?: boolean;
  onsite?: boolean;
}

interface LocationOverride {
  city?: string;
  region?: string;
  country?: string;
}

interface State {
  currentRole: string | null;
  currentCompany: string | null;
  availability: Availability | null;
  roleTypes: RoleTypes | null;
  workEligibility: string[];
  locationOverride: LocationOverride | null;
}

const AVAILABILITY_OPTIONS: Array<{
  value: Availability["kind"];
  label: string;
  hint: string;
}> = [
  {
    value: "available_now",
    label: "Available now",
    hint: "Renders as a prominent chip in the hero.",
  },
  {
    value: "available_after",
    label: "Available later",
    hint: "Renders with the date you provide ('Available May 2026').",
  },
  {
    value: "open_to_chat",
    label: "Open to chat",
    hint: "Soft signal — renders 'Open to conversations'.",
  },
  {
    value: "not_looking",
    label: "Not looking",
    hint: "No availability chip is rendered.",
  },
];

const ROLE_TYPE_FLAGS: Array<{
  key: keyof RoleTypes;
  label: string;
}> = [
  { key: "ic", label: "Individual contributor" },
  { key: "manager", label: "Engineering manager / lead" },
  { key: "fullTime", label: "Full-time" },
  { key: "contract", label: "Contract / consulting" },
  { key: "remote", label: "Remote" },
  { key: "hybrid", label: "Hybrid" },
  { key: "onsite", label: "Onsite" },
];

function emptyState(): State {
  return {
    currentRole: null,
    currentCompany: null,
    availability: null,
    roleTypes: null,
    workEligibility: [],
    locationOverride: null,
  };
}

interface AvailabilityCardProps {
  portfolioId: string;
}

export function AvailabilityCard({ portfolioId }: AvailabilityCardProps) {
  const [state, setState] = useState<State>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [initial, setInitial] = useState<State>(emptyState);

  // Load — same endpoint as IdentityPitchCard but reads our subset.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolios/${portfolioId}/identity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { identity?: Record<string, unknown> } | null) => {
        if (cancelled) return;
        const id = body?.identity ?? {};
        const next: State = {
          currentRole: (id.currentRole as string | null) ?? null,
          currentCompany: (id.currentCompany as string | null) ?? null,
          availability: (id.availability as Availability | null) ?? null,
          roleTypes: (id.roleTypes as RoleTypes | null) ?? null,
          workEligibility: Array.isArray(id.workEligibility)
            ? (id.workEligibility as string[])
            : [],
          locationOverride: (id.locationOverride as LocationOverride | null) ?? null,
        };
        setState(next);
        setInitial(next);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true); // Render empty form on fetch failure.
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const isDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(initial),
    [state, initial]
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Trim strings; null out empties; clamp role-types-all-false to null.
      const body: Record<string, unknown> = {
        currentRole: trimOrNull(state.currentRole),
        currentCompany: trimOrNull(state.currentCompany),
        availability: state.availability,
        roleTypes:
          state.roleTypes &&
          Object.values(state.roleTypes).some((v) => v === true)
            ? state.roleTypes
            : null,
        workEligibility: state.workEligibility.length > 0 ? state.workEligibility : null,
        locationOverride:
          state.locationOverride &&
          (state.locationOverride.city ||
            state.locationOverride.region ||
            state.locationOverride.country)
            ? state.locationOverride
            : null,
      };
      const res = await fetch(`/api/portfolios/${portfolioId}/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody?.error ?? `Save failed (${res.status})`);
        return;
      }
      setInitial(state);
      setSuccess("Saved. Republish to surface the changes on your live site.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }, [portfolioId, state]);

  const setAvailKind = (kind: Availability["kind"]) =>
    setState((s) => ({
      ...s,
      availability:
        kind === "not_looking"
          ? null
          : { kind, startDate: s.availability?.startDate },
    }));

  const toggleRoleType = (key: keyof RoleTypes) =>
    setState((s) => ({
      ...s,
      roleTypes: { ...(s.roleTypes ?? {}), [key]: !s.roleTypes?.[key] },
    }));

  return (
    <Card data-testid="availability-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Briefcase className="h-4 w-4" />
          Availability &amp; preferences
          {isDirty && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-amber-500"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </CardTitle>
        <CardDescription>
          The binary filters every recruiter checks first. All fields are
          optional; left blank, the published site renders nothing in their
          place.
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
            {/* Current role + company */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="current-role">Current role</Label>
                <Input
                  id="current-role"
                  placeholder="Senior Backend Engineer"
                  maxLength={80}
                  value={state.currentRole ?? ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, currentRole: e.target.value }))
                  }
                />
                {(state.currentRole ?? "").trim().length === 0 && (
                  <SuggestPanel<string>
                    portfolioId={portfolioId}
                    field="currentRole"
                    renderSuggestion={(s) => <span>{s}</span>}
                    onUse={(s) => setState((st) => ({ ...st, currentRole: s }))}
                    triggerLabel="Suggest from resume"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current-company">Current company</Label>
                <Input
                  id="current-company"
                  placeholder="Abbott Labs"
                  maxLength={80}
                  value={state.currentCompany ?? ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, currentCompany: e.target.value }))
                  }
                />
                {(state.currentCompany ?? "").trim().length === 0 && (
                  <SuggestPanel<string>
                    portfolioId={portfolioId}
                    field="currentCompany"
                    renderSuggestion={(s) => <span>{s}</span>}
                    onUse={(s) =>
                      setState((st) => ({ ...st, currentCompany: s }))
                    }
                    triggerLabel="Suggest from resume"
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Renders as one hero line: <code>Currently: Senior Backend Engineer @ Abbott Labs</code>.
            </p>

            <Separator />

            {/* Availability */}
            <div className="space-y-3">
              <Label>Availability</Label>
              <div className="grid gap-2">
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                      (state.availability?.kind ?? "not_looking") === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="availabilityKind"
                      className="mt-1"
                      checked={
                        (state.availability?.kind ?? "not_looking") === opt.value
                      }
                      onChange={() => setAvailKind(opt.value)}
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
              {state.availability?.kind === "available_after" && (
                <div className="space-y-1.5 pl-3">
                  <Label htmlFor="avail-start" className="text-xs">
                    Start date / window
                  </Label>
                  <Input
                    id="avail-start"
                    placeholder="May 2026, Q3 2026, after May 15"
                    maxLength={40}
                    value={state.availability.startDate ?? ""}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        availability: s.availability
                          ? { ...s.availability, startDate: e.target.value }
                          : null,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Free-form. Renders verbatim — pick the format that
                    represents your commitment.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Role types */}
            <div className="space-y-3">
              <Label>Open to (multi-select)</Label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {ROLE_TYPE_FLAGS.map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition ${
                      state.roleTypes?.[opt.key]
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={state.roleTypes?.[opt.key] === true}
                      onChange={() => toggleRoleType(opt.key)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Renders as a small comma-list:{" "}
                <code>IC · Full-time · Remote / Hybrid</code>.
              </p>
            </div>

            <Separator />

            {/* Work eligibility */}
            <WorkEligibilityField
              items={state.workEligibility}
              onAdd={(raw) => {
                const trimmed = raw.trim();
                if (!trimmed) return;
                if (
                  state.workEligibility.some(
                    (it) => it.toLowerCase() === trimmed.toLowerCase()
                  )
                )
                  return;
                if (state.workEligibility.length >= 10) return;
                setState((s) => ({
                  ...s,
                  workEligibility: [...s.workEligibility, trimmed],
                }));
              }}
              onRemove={(idx) =>
                setState((s) => ({
                  ...s,
                  workEligibility: s.workEligibility.filter((_, i) => i !== idx),
                }))
              }
            />
            {state.workEligibility.length < 10 && (
              <SuggestPanel<string>
                portfolioId={portfolioId}
                field="workEligibility"
                renderSuggestion={(s) => <span>{s}</span>}
                onUse={(s) => {
                  if (
                    !state.workEligibility.some(
                      (it) => it.toLowerCase() === s.toLowerCase()
                    )
                  ) {
                    setState((st) => ({
                      ...st,
                      workEligibility: [...st.workEligibility, s],
                    }));
                  }
                }}
                triggerLabel={
                  state.workEligibility.length === 0
                    ? "Suggest regions"
                    : "Suggest more"
                }
              />
            )}

            <Separator />

            {/* Location override */}
            <div className="space-y-3">
              <Label>Location override</Label>
              <p className="text-xs text-muted-foreground">
                Optional. Falls through to your resume's location when blank.
                Useful when you're relocating but the resume hasn't caught up.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="City"
                  maxLength={80}
                  value={state.locationOverride?.city ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      locationOverride: {
                        ...(s.locationOverride ?? {}),
                        city: e.target.value,
                      },
                    }))
                  }
                />
                <Input
                  placeholder="Region (CA, NY, …)"
                  maxLength={80}
                  value={state.locationOverride?.region ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      locationOverride: {
                        ...(s.locationOverride ?? {}),
                        region: e.target.value,
                      },
                    }))
                  }
                />
                <Input
                  placeholder="Country (US, UK, …)"
                  maxLength={80}
                  value={state.locationOverride?.country ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      locationOverride: {
                        ...(s.locationOverride ?? {}),
                        country: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-4">
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
        {success && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </span>
        )}
        {!error && !success && <span />}
        <Button onClick={save} disabled={!isDirty || saving}>
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

function trimOrNull(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function WorkEligibilityField({
  items,
  onAdd,
  onRemove,
}: {
  items: string[];
  onAdd: (raw: string) => void;
  onRemove: (idx: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = items.length >= 10;
  const commit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor="work-elig-input">Authorized to work in</Label>
      <div className="flex flex-wrap gap-2">
        {items.map((name, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
          >
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(i)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id="work-elig-input"
          placeholder="US"
          maxLength={40}
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
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter or comma. Up to 10 entries (US, UK, EU, Canada,
        Remote-anywhere, etc.).
      </p>
    </div>
  );
}
