"use client";

/**
 * Phase C — Testimonials manager.
 *
 * A list + an add/edit dialog. Optimistic UI on delete (row disappears
 * immediately, rolls back if the API rejects). Visible/hidden toggle
 * per-row is inline — the user sees hidden rows in the editor but the
 * live site skips them (`isVisible` gate in profile-data.ts).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTHOR_META_MAX,
  AUTHOR_NAME_MAX,
  QUOTE_MAX,
} from "@/lib/identity/validation";

interface TestimonialRow {
  id: string;
  quote: string;
  authorName: string;
  authorTitle: string | null;
  authorCompany: string | null;
  authorUrl: string | null;
  avatarUrl: string | null;
  displayOrder: number;
  isVisible: boolean;
}

interface TestimonialDraft {
  quote: string;
  authorName: string;
  authorTitle: string;
  authorCompany: string;
  authorUrl: string;
  avatarUrl: string;
  isVisible: boolean;
}

function emptyDraft(): TestimonialDraft {
  return {
    quote: "",
    authorName: "",
    authorTitle: "",
    authorCompany: "",
    authorUrl: "",
    avatarUrl: "",
    isVisible: true,
  };
}

function toDraft(t: TestimonialRow): TestimonialDraft {
  return {
    quote: t.quote,
    authorName: t.authorName,
    authorTitle: t.authorTitle ?? "",
    authorCompany: t.authorCompany ?? "",
    authorUrl: t.authorUrl ?? "",
    avatarUrl: t.avatarUrl ?? "",
    isVisible: t.isVisible,
  };
}

export function TestimonialsCard({ portfolioId }: { portfolioId: string }) {
  const [rows, setRows] = useState<TestimonialRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // Edit/create dialog state. `editing === null` hides dialog; a row id
  // means edit that row; "new" means create.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<TestimonialDraft>(emptyDraft);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/testimonials`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(data.testimonials ?? []);
      } catch (err) {
        if (!cancelled) {
          setMessage({
            kind: "err",
            text:
              err instanceof Error
                ? `Failed to load: ${err.message}`
                : "Failed to load testimonials.",
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

  // ─── Open dialog ────────────────────────────────────────────────────────
  const openCreate = () => {
    setDraft(emptyDraft());
    setDialogError(null);
    setEditing("new");
  };
  const openEdit = (row: TestimonialRow) => {
    setDraft(toDraft(row));
    setDialogError(null);
    setEditing(row.id);
  };

  // ─── Save (create or edit) ──────────────────────────────────────────────
  const onSave = useCallback(async () => {
    if (draft.quote.trim().length < 5) {
      setDialogError("Quote is too short.");
      return;
    }
    if (draft.authorName.trim().length === 0) {
      setDialogError("Author name is required.");
      return;
    }
    setDialogSaving(true);
    setDialogError(null);
    try {
      const body = {
        quote: draft.quote.trim(),
        authorName: draft.authorName.trim(),
        authorTitle: draft.authorTitle.trim() || null,
        authorCompany: draft.authorCompany.trim() || null,
        authorUrl: draft.authorUrl.trim() || null,
        avatarUrl: draft.avatarUrl.trim() || null,
        isVisible: draft.isVisible,
      };
      const isNew = editing === "new";
      const url = isNew
        ? `/api/portfolios/${portfolioId}/testimonials`
        : `/api/portfolios/${portfolioId}/testimonials/${editing}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.issues?.[0]?.message || err?.error || `HTTP ${res.status}`
        );
      }
      const data = await res.json();
      const row: TestimonialRow = data.testimonial;
      setRows((rs) => {
        if (isNew) return [...rs, row];
        return rs.map((r) => (r.id === row.id ? row : r));
      });
      setEditing(null);
      setMessage({
        kind: "ok",
        text: isNew ? "Testimonial added." : "Saved.",
      });
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "Save failed, please retry."
      );
    } finally {
      setDialogSaving(false);
    }
  }, [draft, editing, portfolioId]);

  // ─── Delete (optimistic) ───────────────────────────────────────────────
  const onDelete = useCallback(
    async (row: TestimonialRow) => {
      const confirmed = confirm(
        `Delete testimonial from ${row.authorName}? This can't be undone.`
      );
      if (!confirmed) return;
      const prev = rows;
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/testimonials/${row.id}`,
          { method: "DELETE" }
        );
        if (!res.ok && res.status !== 204) {
          throw new Error(`HTTP ${res.status}`);
        }
        setMessage({ kind: "ok", text: "Deleted." });
      } catch (err) {
        setRows(prev); // rollback
        setMessage({
          kind: "err",
          text:
            err instanceof Error
              ? err.message
              : "Delete failed, please retry.",
        });
      }
    },
    [portfolioId, rows]
  );

  // ─── Toggle visibility (optimistic PATCH) ──────────────────────────────
  const onToggleVisible = useCallback(
    async (row: TestimonialRow) => {
      const next = !row.isVisible;
      setRows((rs) =>
        rs.map((r) => (r.id === row.id ? { ...r, isVisible: next } : r))
      );
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/testimonials/${row.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isVisible: next }),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // rollback on failure
        setRows((rs) =>
          rs.map((r) =>
            r.id === row.id ? { ...r, isVisible: row.isVisible } : r
          )
        );
        setMessage({ kind: "err", text: "Visibility update failed." });
      }
    },
    [portfolioId]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Quote className="h-4 w-4" />
            Testimonials
          </CardTitle>
          <CardDescription>
            Named, titled quotes from people you've worked with. Templates
            render these as pull-quotes and carousels.
          </CardDescription>
        </div>
        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing === "new" ? "Add testimonial" : "Edit testimonial"}
              </DialogTitle>
              <DialogDescription>
                Quote from a real, named third party. Avoid anonymous or
                paraphrased recommendations.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="quote">Quote</Label>
                  <span
                    className={`text-xs ${
                      draft.quote.length > QUOTE_MAX
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {draft.quote.length}/{QUOTE_MAX}
                  </span>
                </div>
                <textarea
                  id="quote"
                  rows={4}
                  maxLength={QUOTE_MAX + 20}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={draft.quote}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, quote: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="author-name">Name</Label>
                  <Input
                    id="author-name"
                    maxLength={AUTHOR_NAME_MAX}
                    value={draft.authorName}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, authorName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author-title">Title</Label>
                  <Input
                    id="author-title"
                    placeholder="VP Engineering"
                    maxLength={AUTHOR_META_MAX}
                    value={draft.authorTitle}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, authorTitle: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="author-company">Company</Label>
                  <Input
                    id="author-company"
                    placeholder="Acme Inc."
                    maxLength={AUTHOR_META_MAX}
                    value={draft.authorCompany}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        authorCompany: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author-url">LinkedIn / site</Label>
                  <Input
                    id="author-url"
                    placeholder="https://linkedin.com/in/…"
                    value={draft.authorUrl}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, authorUrl: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avatar-url">Avatar URL (optional)</Label>
                <Input
                  id="avatar-url"
                  placeholder="https://…/avatar.jpg"
                  value={draft.avatarUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, avatarUrl: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isVisible}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isVisible: e.target.checked }))
                  }
                />
                Show on published site
              </label>
              {dialogError && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {dialogError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setEditing(null)}
                disabled={dialogSaving}
              >
                Cancel
              </Button>
              <Button onClick={onSave} disabled={dialogSaving}>
                {dialogSaving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>Save</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-3">
        {!loaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {loaded && rows.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No testimonials yet. A single named endorsement beats ten
            anonymous ones — paste a LinkedIn recommendation or a direct
            quote to start.
          </div>
        )}

        {loaded &&
          rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-md border p-4 transition ${
                row.isVisible ? "" : "opacity-60"
              }`}
            >
              <p className="text-sm leading-relaxed">{row.quote}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">
                    {row.authorName}
                  </strong>
                  {(row.authorTitle || row.authorCompany) && (
                    <>
                      {" · "}
                      {[row.authorTitle, row.authorCompany]
                        .filter(Boolean)
                        .join(" · ")}
                    </>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleVisible(row)}
                    title={row.isVisible ? "Hide from site" : "Show on site"}
                  >
                    {row.isVisible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

        {message && (
          <p
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
          </p>
        )}
      </CardContent>
    </Card>
  );
}
