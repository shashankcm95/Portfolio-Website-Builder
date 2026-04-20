"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { detectDemoType, resolveDemo } from "@/lib/demos/platform-detect";
import { hasMixedSlideshowTypes } from "@/lib/demos/render-mode";
import { isValidDemoUrl } from "@/lib/demos/validation";
import {
  MAX_DEMOS_PER_PROJECT,
  type DemoType,
  type ProjectDemo,
} from "@/lib/demos/types";

interface DemoFormProps {
  portfolioId: string;
  projectId: string;
  initialDemos: ProjectDemo[];
  /** Called after any successful save / clear so parent can re-render the preview. */
  onDemosChanged?: (demos: ProjectDemo[]) => void;
  className?: string;
}

interface DraftRow {
  /** Local-only key so React doesn't remount inputs when reordering. */
  key: string;
  url: string;
  title: string;
}

/**
 * Multi-URL demo editor. Handles up to {@link MAX_DEMOS_PER_PROJECT} rows;
 * shows live type detection per row; warns when the mix would break the
 * slideshow rendering (video + image); one umbrella title shared across
 * the slideshow.
 *
 * Save → PUT /demo with the full list. Clear all → DELETE /demo.
 */
export function DemoForm({
  portfolioId,
  projectId,
  initialDemos,
  onDemosChanged,
  className,
}: DemoFormProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => fromDemos(initialDemos));
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Phase 4.1 — direct upload state. `uploadConfig` caches the feature-
  // flag response from /api/uploads/config so we know whether to enable
  // the "Upload file" button or show the disabled-with-tooltip variant.
  const [uploadConfig, setUploadConfig] = useState<
    | { loaded: false }
    | { loaded: true; enabled: true }
    | { loaded: true; enabled: false; reason: string }
  >({ loaded: false });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRows(fromDemos(initialDemos));
  }, [initialDemos]);

  // Load upload-feature flag once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/uploads/config");
        if (!res.ok) {
          if (!cancelled)
            setUploadConfig({
              loaded: true,
              enabled: false,
              reason: "Upload service unavailable",
            });
          return;
        }
        const data = (await res.json()) as
          | { enabled: true }
          | { enabled: false; reason: string };
        if (cancelled) return;
        setUploadConfig(
          data.enabled
            ? { loaded: true, enabled: true }
            : { loaded: true, enabled: false, reason: data.reason }
        );
      } catch {
        if (!cancelled)
          setUploadConfig({
            loaded: true,
            enabled: false,
            reason: "Network error",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => {
      if (prev.length >= MAX_DEMOS_PER_PROJECT) return prev;
      return [...prev, { key: crypto.randomUUID(), url: "", title: "" }];
    });
    setError(null);
    setSuccess(null);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setError(null);
    setSuccess(null);
  }, []);

  const updateRow = useCallback(
    (key: string, patch: Partial<DraftRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
      );
      setError(null);
      setSuccess(null);
    },
    []
  );

  // Preview logic: resolve each row to its type; compute mixed warning
  const resolved = useMemo(() => {
    return rows
      .filter((r) => r.url.trim().length > 0)
      .map((r, i) => {
        const type = detectDemoType(r.url);
        const tmpDemo = {
          id: r.key,
          url: r.url,
          type,
          title: r.title || null,
          order: i,
        };
        return resolveDemo(tmpDemo);
      });
  }, [rows]);

  const showMixedWarning = hasMixedSlideshowTypes(resolved);

  const hasInvalidRows = rows.some(
    (r) => r.url.trim().length > 0 && !isValidDemoUrl(r.url)
  );
  const nonEmptyRows = rows.filter((r) => r.url.trim().length > 0);

  const save = useCallback(async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);

    if (hasInvalidRows) {
      setError("Fix the highlighted URLs before saving.");
      return;
    }

    const body = {
      demos: nonEmptyRows.map((r) => ({
        url: r.url.trim(),
        title: r.title.trim() || null,
      })),
    };

    setSaving(true);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/${projectId}/demo`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed");
        return;
      }
      const data = (await res.json()) as { demos: ProjectDemo[] };
      setSuccess(
        data.demos.length === 0
          ? "Cleared all demos."
          : `Saved ${data.demos.length} demo${data.demos.length === 1 ? "" : "s"}.`
      );
      onDemosChanged?.(data.demos);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    hasInvalidRows,
    nonEmptyRows,
    portfolioId,
    projectId,
    onDemosChanged,
  ]);

  const clearAll = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/${projectId}/demo`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError("Clear failed");
        return;
      }
      setRows([]);
      setSuccess("All demos removed.");
      onDemosChanged?.([]);
    } catch {
      setError("Network error");
    } finally {
      setClearing(false);
    }
  }, [clearing, portfolioId, projectId, onDemosChanged]);

  // Phase 4.1 — open the hidden file picker.
  const openFilePicker = useCallback(() => {
    if (uploading) return;
    if (rows.length >= MAX_DEMOS_PER_PROJECT) {
      setError(`At most ${MAX_DEMOS_PER_PROJECT} demos per project`);
      return;
    }
    fileInputRef.current?.click();
  }, [uploading, rows.length]);

  // Phase 4.1 — handle selected file: POST to upload route, append URL.
  const onFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input so the same file can be picked again next time.
      e.target.value = "";
      if (!file || uploading) return;

      if (rows.length >= MAX_DEMOS_PER_PROJECT) {
        setError(`At most ${MAX_DEMOS_PER_PROJECT} demos per project`);
        return;
      }

      setUploading(true);
      setError(null);
      setSuccess(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(
          `/api/portfolios/${portfolioId}/projects/${projectId}/demo/upload`,
          { method: "POST", body: fd }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Upload failed");
          return;
        }
        const body = (await res.json()) as { url: string };
        setRows((prev) => [
          ...prev,
          { key: crypto.randomUUID(), url: body.url, title: "" },
        ]);
        setSuccess(
          "File uploaded. Don't forget to click Save to attach it to the project."
        );
      } catch {
        setError("Network error during upload");
      } finally {
        setUploading(false);
      }
    },
    [uploading, rows.length, portfolioId, projectId]
  );

  return (
    <div
      className={cn("space-y-4", className)}
      data-testid="demo-form"
    >
      <p className="text-sm text-muted-foreground">
        Paste a Loom, YouTube, or Vimeo link — or add multiple image / GIF
        URLs to build a slideshow.
      </p>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
            No demos yet. Click{" "}
            <span className="font-medium">Add URL</span> to start.
          </p>
        )}

        {rows.map((row, i) => {
          const type: DemoType | null =
            row.url.trim().length > 0 ? detectDemoType(row.url) : null;
          const valid =
            row.url.trim().length === 0 || isValidDemoUrl(row.url);
          return (
            <div
              key={row.key}
              className="flex flex-wrap items-start gap-2"
              data-testid="demo-form-row"
              data-row-index={i}
            >
              <div className="flex-1 min-w-[240px] space-y-1">
                <Input
                  value={row.url}
                  onChange={(e) =>
                    updateRow(row.key, { url: e.target.value })
                  }
                  placeholder="https://www.youtube.com/watch?v=… or https://cdn.example.com/shot.png"
                  disabled={saving}
                  aria-invalid={!valid}
                  className={cn(!valid && "border-destructive")}
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {type
                      ? `Detected: ${prettyType(type)}`
                      : "Paste a URL to see its type"}
                  </span>
                  {!valid && (
                    <span className="text-destructive">Invalid URL</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove demo ${i + 1}`}
                onClick={() => removeRow(row.key)}
                disabled={saving}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {rows.length < MAX_DEMOS_PER_PROJECT && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={saving}
            className="mt-1 gap-1.5"
            data-testid="demo-form-add-row"
          >
            <Plus className="h-3.5 w-3.5" />
            Add URL
          </Button>
        )}
      </div>

      {/* Shared title — used as umbrella label on slideshow */}
      {nonEmptyRows.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="demo-form-title" className="text-xs">
            Title (optional)
          </Label>
          <Input
            id="demo-form-title"
            value={rows[0]?.title ?? ""}
            onChange={(e) =>
              rows[0] && updateRow(rows[0].key, { title: e.target.value })
            }
            placeholder="Product tour"
            disabled={saving}
          />
        </div>
      )}

      {/* Mixed-type warning */}
      {showMixedWarning && (
        <p
          className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
          role="status"
          data-testid="demo-form-mixed-warning"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Mixing a video URL with images disables the slideshow — only the
          first URL will render.
        </p>
      )}

      {/* Save / clear */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          onClick={save}
          disabled={saving || hasInvalidRows || uploading}
          size="sm"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
        {(nonEmptyRows.length > 0 || initialDemos.length > 0) && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={clearing}
          >
            {clearing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Clear all
          </Button>
        )}

        {/* Phase 4.1 — direct upload (R2). When unconfigured, the button
            stays disabled with a reason tooltip. */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={onFilePicked}
          data-testid="demo-form-upload-input"
        />
        {uploadConfig.loaded && uploadConfig.enabled ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={openFilePicker}
            disabled={uploading || saving}
            className="ml-auto gap-1 text-xs"
            data-testid="demo-form-upload-file"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Upload file
              </>
            )}
          </Button>
        ) : (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    aria-disabled="true"
                    className="pointer-events-none gap-1 text-xs text-muted-foreground"
                    data-testid="demo-form-upload-disabled"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload file
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="text-xs">
                {uploadConfig.loaded
                  ? `Uploads disabled: ${uploadConfig.reason}`
                  : "Checking upload availability…"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <p
          className="flex items-start gap-1.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p
          className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {success}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fromDemos(demos: ProjectDemo[]): DraftRow[] {
  return demos.map((d) => ({
    key: d.id,
    url: d.url,
    title: d.title ?? "",
  }));
}

function prettyType(type: DemoType): string {
  switch (type) {
    case "youtube":
      return "YouTube";
    case "loom":
      return "Loom";
    case "vimeo":
      return "Vimeo";
    case "video":
      return "video file";
    case "image":
      return "image";
    case "gif":
      return "GIF";
    default:
      return "external link";
  }
}
