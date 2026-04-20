"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  description: string | null;
  previewUrl: string | null;
  isPremium: boolean | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewPortfolioPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("minimal");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available templates
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) throw new Error("Failed to load templates");
        const { templates: list } = (await res.json()) as { templates: Template[] };
        if (cancelled) return;
        setTemplates(list);
        // Pick first template if "minimal" isn't in the list.
        if (list.length > 0 && !list.find((t) => t.id === "minimal")) {
          setTemplateId(list[0].id);
        }
      } catch {
        // Leave with hardcoded "minimal" fallback; user will still be able to submit.
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugManuallyEdited) {
        setSlug(slugify(value));
      }
    },
    [slugManuallyEdited]
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlugManuallyEdited(true);
    setSlug(slugify(value));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), templateId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to create portfolio (${res.status})`);
      }

      const { portfolio } = await res.json();
      router.push(`/portfolios/${portfolio.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create portfolio");
    } finally {
      setIsSubmitting(false);
    }
  }, [name, slug, templateId, router]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Create Portfolio"
        description="Set up a new portfolio website."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Portfolio Details</CardTitle>
          <CardDescription>
            Fill in the details below to create your new portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Portfolio Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Portfolio Name</Label>
            <Input
              id="name"
              placeholder="My Developer Portfolio"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* URL Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              placeholder="my-portfolio"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Your portfolio will be available at: yoursite.com/
              <span className="font-medium">{slug || "my-portfolio"}</span>
            </p>
          </div>

          {/* Template Picker */}
          <div className="space-y-2">
            <Label>Template</Label>
            {templatesLoading ? (
              <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                No templates available.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => {
                  const selected = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      disabled={isSubmitting}
                      className={cn(
                        "group relative flex flex-col gap-2 rounded-md border p-4 text-left transition",
                        selected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "hover:border-muted-foreground/40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{t.name}</p>
                        {selected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      {t.isPremium && (
                        <span className="inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                          Premium
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="ghost" asChild>
            <Link href="/portfolios">Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Portfolio"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
