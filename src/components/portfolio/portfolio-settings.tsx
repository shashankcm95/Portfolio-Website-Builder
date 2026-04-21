"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  description: string | null;
  isPremium: boolean | null;
  // Phase 7 — config blob may carry an "audience" tag list used to
  // render small chips on the picker card. The /api/templates endpoint
  // returns the full row so this field is populated whenever the seed
  // script set it.
  config?: { audience?: string[] } & Record<string, unknown>;
}

const AUDIENCE_LABELS: Record<string, string> = {
  sde: "SDE",
  research: "Research",
  ml: "ML",
  academic: "Academic",
  sre: "SRE",
  devops: "DevOps",
  systems: "Systems",
  infra: "Infra",
  leader: "Leader",
  "designer-dev": "Designer-dev",
  writing: "Writing",
};

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateId: string;
}

interface PortfolioSettingsProps {
  portfolio: Portfolio;
  onUpdated: (portfolio: Portfolio) => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Settings tab for an existing portfolio: edit name, slug, template, and
 * visibility; delete the portfolio entirely.
 *
 * The DB PATCH accepts these fields already — this just wires up the UI.
 */
export function PortfolioSettings({
  portfolio,
  onUpdated,
}: PortfolioSettingsProps) {
  const router = useRouter();

  const [name, setName] = useState(portfolio.name);
  const [slug, setSlug] = useState(portfolio.slug);
  const [templateId, setTemplateId] = useState(portfolio.templateId);
  const [status, setStatus] = useState(portfolio.status);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) return;
        const { templates: list } = (await res.json()) as {
          templates: Template[];
        };
        if (!cancelled) setTemplates(list);
      } catch {
        // Keep empty list; picker falls back to current selection only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges =
    name.trim() !== portfolio.name ||
    slug.trim() !== portfolio.slug ||
    templateId !== portfolio.templateId ||
    status !== portfolio.status;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolio.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          templateId,
          status,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      const { portfolio: updated } = await res.json();
      onUpdated(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }, [portfolio.id, name, slug, templateId, status, onUpdated]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolio.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      router.push("/portfolios");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete portfolio"
      );
      setIsDeleting(false);
    }
  }, [portfolio.id, router]);

  return (
    <div className="space-y-6">
      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portfolio Settings</CardTitle>
          <CardDescription>
            Update your portfolio&apos;s name, URL, and look.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-slug">URL Slug</Label>
            <Input
              id="settings-slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Your site will be served from <span className="font-mono">/{slug || "..."}</span>.
              Changing this will break old links.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex gap-2">
              {[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  disabled={isSaving}
                  className={cn(
                    "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition",
                    status === opt.value
                      ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                      : "hover:border-muted-foreground/40"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Draft portfolios aren&apos;t indexed and only load for you.
              Published sites are visible to anyone with the link.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            {templates.length === 0 ? (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Loading templates...
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => {
                  const selected = templateId === t.id;
                  const audience = Array.isArray(t.config?.audience)
                    ? (t.config!.audience as string[])
                    : [];
                  const previewHref = `/api/portfolios/${portfolio.id}/preview?templateId=${encodeURIComponent(t.id)}`;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "relative flex flex-col gap-2 rounded-md border p-4 text-left transition",
                        selected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "hover:border-muted-foreground/40"
                      )}
                      data-testid={`template-card-${t.id}`}
                    >
                      {/* The whole card is selectable except where buttons
                          live (the "Preview" link below). Use a button
                          inside instead of wrapping everything in <button>
                          to allow nested interactives. */}
                      <button
                        type="button"
                        onClick={() => setTemplateId(t.id)}
                        disabled={isSaving}
                        className="flex items-start justify-between gap-2 text-left"
                      >
                        <p className="text-sm font-medium">{t.name}</p>
                        {selected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>

                      {t.description && (
                        <button
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          disabled={isSaving}
                          className="text-left"
                        >
                          <p className="text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        </button>
                      )}

                      {audience.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {audience.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                            >
                              {AUDIENCE_LABELS[tag] ?? tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-1 pt-1">
                        <a
                          href={previewHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-primary underline-offset-2 hover:underline"
                          data-testid={`template-preview-${t.id}`}
                        >
                          Preview this template ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Changing the template will re-render your site on the next deploy.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="text-xs">
            {savedAt && Date.now() - savedAt < 3000 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || !name.trim() || !slug.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions. Please be certain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete this portfolio</p>
              <p className="text-xs text-muted-foreground">
                Removes all projects, generated content, and deployments
                associated with this portfolio. This cannot be undone.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete &ldquo;{portfolio.name}&rdquo;?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete the portfolio, all its
                    projects, generated content, and any deployment history.
                    Type the portfolio name to confirm.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">
                    Type <span className="font-mono">{portfolio.name}</span> to
                    confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    disabled={isDeleting}
                    autoComplete="off"
                  />
                  {deleteError && (
                    <p className="text-sm text-destructive">{deleteError}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={
                      isDeleting || deleteConfirmText !== portfolio.name
                    }
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Permanently Delete
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
