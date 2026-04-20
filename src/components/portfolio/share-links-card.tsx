"use client";

/**
 * Phase 6 — Owner-facing share-links management.
 *
 * Lives in the portfolio detail page's Settings tab. Responsibilities:
 *   - Generate a new share link (optional label + expiry dropdown).
 *   - Copy the URL to clipboard.
 *   - Show active + revoked links with view counts and last-viewed time.
 *   - Revoke an active link (soft delete, keeps view-count history).
 *
 * The share link URLs use `{APP_URL}/share/{token}` — the API returns
 * the full URL so we never build it client-side (the API knows the app
 * origin, including the self-host case where NEXT_PUBLIC_APP_URL is unset).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
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
import { cn } from "@/lib/utils";

type ExpiryChoice = "24h" | "7d" | "30d" | "never";

interface ShareLinkSummary {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string | null;
}

interface ShareLinksCardProps {
  portfolioId: string;
}

export function ShareLinksCard({ portfolioId }: ShareLinksCardProps) {
  const [links, setLinks] = useState<ShareLinkSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<ExpiryChoice>("7d");
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/share-links`);
      if (!res.ok) {
        setLinks([]);
        return;
      }
      const data = (await res.json()) as { links: ShareLinkSummary[] };
      setLinks(data.links);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  const createLink = useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = {};
      if (label.trim()) body.label = label.trim();
      body.expiresIn = expiry; // "24h" | "7d" | "30d" | "never"

      const res = await fetch(`/api/portfolios/${portfolioId}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create link");
        return;
      }
      const data = (await res.json()) as {
        link: ShareLinkSummary;
        url: string;
      };
      setLabel("");
      setLastCreatedUrl(data.url);
      // Prepend the new link so the owner sees it immediately.
      setLinks((prev) => (prev ? [data.link, ...prev] : [data.link]));
      // Copy to clipboard automatically if available.
      try {
        await navigator.clipboard.writeText(data.url);
        setCopiedId(data.link.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        /* clipboard may be unavailable — UI falls back to manual copy */
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }, [portfolioId, label, expiry]);

  const revoke = useCallback(
    async (linkId: string) => {
      setError(null);
      try {
        const res = await fetch(
          `/api/portfolios/${portfolioId}/share-links/${linkId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to revoke link");
          return;
        }
        setLinks((prev) =>
          prev
            ? prev.map((l) =>
                l.id === linkId
                  ? { ...l, revokedAt: new Date().toISOString() }
                  : l
              )
            : prev
        );
      } catch {
        setError("Network error");
      }
    },
    [portfolioId]
  );

  const copyUrl = useCallback(async (link: ShareLinkSummary) => {
    try {
      // Re-derive from window.location to avoid staleness vs the original
      // response's URL (e.g., if the owner edited via a different origin).
      const url = buildUrl(link.token);
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Copy failed — select + copy manually.");
    }
  }, []);

  return (
    <Card data-testid="share-links-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Share this portfolio
        </CardTitle>
        <CardDescription>
          Generate a private URL that anyone with the link can view — even
          before you publish. Revoke any link to disable it instantly.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Create */}
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="share-link-label" className="text-xs">
                Label (optional)
              </Label>
              <Input
                id="share-link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={'e.g. "for Jane at Acme"'}
                maxLength={80}
                disabled={creating}
                data-testid="share-link-label"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="share-link-expiry" className="text-xs">
                Expires
              </Label>
              <select
                id="share-link-expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
                disabled={creating}
                className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="share-link-expiry"
              >
                <option value="24h">in 24 hours</option>
                <option value="7d">in 7 days</option>
                <option value="30d">in 30 days</option>
                <option value="never">never</option>
              </select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={createLink}
            disabled={creating}
            data-testid="share-link-create"
          >
            {creating ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Generate share link
              </>
            )}
          </Button>

          {lastCreatedUrl && (
            <p className="break-all rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">New link:</span>{" "}
              {lastCreatedUrl}
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {/* List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">Your share links</h4>
              <p className="text-xs text-muted-foreground">
                Active + revoked, newest first.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              data-testid="share-links-refresh"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {links === null && loading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {links !== null && links.length === 0 && (
            <p
              className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
              data-testid="share-links-empty"
            >
              No share links yet. Generate one above to hand out to recruiters
              or collaborators.
            </p>
          )}
          {links !== null && links.length > 0 && (
            <ul className="space-y-2" data-testid="share-links-list">
              {links.map((l) => {
                const revoked = l.revokedAt !== null;
                const expired = !revoked && isExpired(l.expiresAt);
                const inactive = revoked || expired;
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "rounded-md border px-3 py-2",
                      inactive && "bg-muted/30 text-muted-foreground"
                    )}
                    data-link-id={l.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              inactive && "line-through"
                            )}
                          >
                            {l.label ?? "Unnamed link"}
                          </span>
                          {revoked && <StatusBadge tone="destructive">revoked</StatusBadge>}
                          {!revoked && expired && <StatusBadge tone="amber">expired</StatusBadge>}
                          {!inactive && <StatusBadge tone="emerald">active</StatusBadge>}
                        </div>
                        <p className="break-all font-mono text-[10px]">
                          /share/{l.token}
                        </p>
                        <p className="text-[10px]">
                          {l.viewCount} view{l.viewCount === 1 ? "" : "s"}
                          {l.lastViewedAt &&
                            ` • last viewed ${new Date(
                              l.lastViewedAt
                            ).toLocaleString()}`}
                          {l.expiresAt &&
                            !revoked &&
                            ` • ${expired ? "expired" : "expires"} ${new Date(
                              l.expiresAt
                            ).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!inactive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyUrl(l)}
                            aria-label="Copy share URL"
                            data-testid={`share-link-copy-${l.id}`}
                          >
                            {copiedId === l.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        {!revoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revoke(l.id)}
                            aria-label="Revoke share link"
                            data-testid={`share-link-revoke-${l.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Treat share links like private URLs — anyone with the URL can view
        the draft. Revoke a link to turn it off immediately.
      </CardFooter>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/share/${token}`;
  }
  return `/share/${token}`;
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return Date.parse(iso) < Date.now();
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "destructive" | "amber" | "emerald";
  children: React.ReactNode;
}) {
  const cls =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        cls
      )}
    >
      {children}
    </span>
  );
}
