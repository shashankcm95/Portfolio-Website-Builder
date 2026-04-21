"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  GitFork,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Archive,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RepoRow {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  htmlUrl: string;
  isFork: boolean;
  isArchived: boolean;
  alreadyImported: boolean;
}

interface ImportResultRow {
  owner: string;
  name: string;
  status: "imported" | "skipped" | "failed";
  projectId?: string;
  reason?: string;
}

interface RepoPickerProps {
  portfolioId: string;
  /** Pre-fill the username input. Typically `session.user.githubUsername`. */
  defaultLogin?: string;
  /** Fired whenever at least one repo was successfully imported. */
  onImported?: () => void;
}

const MAX_SELECTED = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const ms = Date.now() - then;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (ms < hour) return `${Math.max(1, Math.round(ms / min))}m ago`;
  if (ms < day) return `${Math.round(ms / hour)}h ago`;
  if (ms < 30 * day) return `${Math.round(ms / day)}d ago`;
  if (ms < 365 * day) return `${Math.round(ms / (30 * day))}mo ago`;
  return `${Math.round(ms / (365 * day))}y ago`;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Rust: "bg-orange-600",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Ruby: "bg-red-600",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-500",
  Dart: "bg-sky-400",
  PHP: "bg-indigo-400",
  Shell: "bg-emerald-500",
  HTML: "bg-orange-500",
  CSS: "bg-purple-400",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function RepoPicker({
  portfolioId,
  defaultLogin,
  onImported,
}: RepoPickerProps) {
  const [login, setLogin] = useState(defaultLogin ?? "");
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [outcomes, setOutcomes] = useState<Map<string, ImportResultRow> | null>(
    null
  );

  useEffect(() => {
    if (defaultLogin && !login) {
      setLogin(defaultLogin);
    }
    // defaultLogin is stable per-session; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLogin]);

  const keyFor = (r: Pick<RepoRow, "owner" | "name">) =>
    `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`;

  const loadRepos = useCallback(async () => {
    const trimmed = login.trim();
    if (!trimmed) {
      setError("Enter a GitHub username");
      return;
    }
    setLoading(true);
    setError(null);
    setOutcomes(null);
    setSelected(new Set());
    try {
      const res = await fetch(
        `/api/github/users/${encodeURIComponent(trimmed)}/repos?portfolioId=${encodeURIComponent(portfolioId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load repos (${res.status})`);
      }
      setRepos(Array.isArray(data.repos) ? data.repos : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repos");
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, [login, portfolioId]);

  const toggle = useCallback((r: RepoRow) => {
    if (r.alreadyImported) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = keyFor(r);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_SELECTED) return prev;
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const selectedRepos = useMemo(
    () => repos.filter((r) => selected.has(keyFor(r))),
    [repos, selected]
  );

  const runImport = useCallback(async () => {
    if (selectedRepos.length === 0) return;
    setImporting(true);
    setError(null);
    setOutcomes(null);
    try {
      const res = await fetch(
        `/api/portfolios/${portfolioId}/projects/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repos: selectedRepos.map((r) => ({
              owner: r.owner,
              name: r.name,
            })),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Import failed (${res.status})`);
      }

      const byKey = new Map<string, ImportResultRow>();
      const resultRows: ImportResultRow[] = Array.isArray(data.results)
        ? data.results
        : [];
      for (const row of resultRows) {
        byKey.set(keyFor(row), row);
      }
      setOutcomes(byKey);

      const anyImported = resultRows.some((r) => r.status === "imported");
      if (anyImported) {
        onImported?.();
      }

      // Mark successfully imported rows so the user can't re-select them.
      setRepos((prev) =>
        prev.map((r) => {
          const outcome = byKey.get(keyFor(r));
          if (outcome?.status === "imported") {
            return { ...r, alreadyImported: true };
          }
          return r;
        })
      );
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [selectedRepos, portfolioId, onImported]);

  return (
    <div className="space-y-4">
      {/* Username + Load */}
      <div className="space-y-1.5">
        <Label htmlFor="repo-picker-login">GitHub username</Label>
        <div className="flex gap-2">
          <Input
            id="repo-picker-login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                loadRepos();
              }
            }}
            placeholder="octocat"
            disabled={loading || importing}
            aria-label="GitHub username"
          />
          <Button
            onClick={loadRepos}
            disabled={loading || importing || !login.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading
              </>
            ) : (
              "Load repos"
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Repo list */}
      {repos.length > 0 && (
        <div
          className="max-h-[420px] overflow-y-auto rounded-lg border divide-y"
          role="list"
          aria-label="GitHub repositories"
        >
          {repos.map((r) => {
            const key = keyFor(r);
            const isSelected = selected.has(key);
            const outcome = outcomes?.get(key);
            const disabledForMax =
              !isSelected &&
              !r.alreadyImported &&
              selectedCount >= MAX_SELECTED;

            return (
              <div
                key={key}
                role="listitem"
                className={cn(
                  "flex items-start gap-3 p-3 transition-colors",
                  r.alreadyImported
                    ? "bg-muted/30"
                    : "hover:bg-muted/20 cursor-pointer",
                  disabledForMax && "opacity-60"
                )}
                onClick={() => toggle(r)}
              >
                {r.alreadyImported ? (
                  <div className="flex h-5 w-5 items-center justify-center flex-shrink-0 mt-0.5">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                ) : (
                  <input
                    type="checkbox"
                    className="h-4 w-4 mt-1 flex-shrink-0 accent-primary"
                    checked={isSelected}
                    disabled={disabledForMax || importing}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(r)}
                    aria-label={`Select ${r.fullName}`}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {r.name}
                    </span>
                    {r.alreadyImported && (
                      <Badge
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        <Info className="h-3 w-3 mr-1" />
                        imported
                      </Badge>
                    )}
                    {r.isFork && (
                      <Badge variant="outline" className="text-xs">
                        <GitFork className="h-3 w-3 mr-1" />
                        fork
                      </Badge>
                    )}
                    {r.isArchived && (
                      <Badge variant="outline" className="text-xs">
                        <Archive className="h-3 w-3 mr-1" />
                        archived
                      </Badge>
                    )}
                    {outcome && (
                      <OutcomeBadge outcome={outcome} />
                    )}
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {r.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    {r.language && (
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            LANGUAGE_COLORS[r.language] || "bg-gray-400"
                          )}
                        />
                        {r.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {formatStars(r.stars)}
                    </span>
                    <span>Updated {formatRelative(r.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && repos.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Enter your GitHub username and click &quot;Load repos&quot; to
          browse everything available for import.
        </p>
      )}

      {/* Footer — selection summary + import button */}
      {repos.length > 0 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {selectedCount} selected
            {selectedCount >= MAX_SELECTED && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                (max {MAX_SELECTED})
              </span>
            )}
          </p>
          <Button
            onClick={runImport}
            disabled={
              importing ||
              selectedCount === 0 ||
              selectedCount > MAX_SELECTED
            }
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${selectedCount} selected`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: ImportResultRow }) {
  if (outcome.status === "imported") {
    return (
      <Badge
        variant="secondary"
        className="text-xs font-normal bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        imported
      </Badge>
    );
  }
  if (outcome.status === "skipped") {
    return (
      <Badge variant="outline" className="text-xs font-normal">
        skipped
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-xs font-normal text-destructive border-destructive/50"
      title={outcome.reason}
    >
      <XCircle className="h-3 w-3 mr-1" />
      failed
    </Badge>
  );
}
