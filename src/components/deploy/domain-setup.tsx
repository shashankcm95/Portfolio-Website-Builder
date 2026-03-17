"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Domain {
  id: string;
  domain: string;
  verificationStatus: string;
  dnsRecordType: string;
  dnsTarget: string;
  sslStatus: string;
  lastChecked?: string;
  verifiedAt?: string;
}

interface DomainSetupProps {
  portfolioId: string;
}

type VerificationStatus = "pending" | "verified" | "failed";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatusConfig(status: string): {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  color: string;
} {
  switch (status) {
    case "verified":
      return {
        icon: CheckCircle2,
        label: "Verified",
        variant: "default",
        color: "text-green-600",
      };
    case "failed":
      return {
        icon: XCircle,
        label: "Failed",
        variant: "destructive",
        color: "text-red-600",
      };
    case "pending":
    default:
      return {
        icon: Clock,
        label: "Pending",
        variant: "secondary",
        color: "text-yellow-600",
      };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DomainSetup({ portfolioId }: DomainSetupProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);

  const basePath = `/api/portfolios/${portfolioId}/domains`;

  // ── Fetch domains ──

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(basePath);
      if (!res.ok) throw new Error("Failed to fetch domains");
      const data = await res.json();
      setDomains(data.domains ?? data ?? []);
    } catch {
      // Silently handle fetch errors on load
    } finally {
      setIsLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // ── Add domain ──

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;

    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!domainRegex.test(trimmed)) {
      setAddError("Please enter a valid domain name (e.g., mysite.example.com)");
      return;
    }

    setIsAdding(true);
    setAddError(null);

    try {
      const res = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add domain");
      }

      const data = await res.json();
      setDomains((prev) => [...prev, data.domain ?? data]);
      setNewDomain("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setIsAdding(false);
    }
  }

  // ── Verify domain ──

  async function handleVerify(domainId: string) {
    setVerifyingId(domainId);

    try {
      const res = await fetch(`${basePath}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Verification failed");
      }

      const data = await res.json();
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId
            ? { ...d, ...data.domain, verificationStatus: data.status ?? d.verificationStatus }
            : d
        )
      );
    } catch {
      // Update domain to show failed status
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId ? { ...d, verificationStatus: "failed" } : d
        )
      );
    } finally {
      setVerifyingId(null);
    }
  }

  // ── Remove domain ──

  async function handleRemove(domainId: string) {
    setRemovingId(domainId);

    try {
      const res = await fetch(`${basePath}/${domainId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove domain");
      }

      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch {
      // Silently handle deletion errors
    } finally {
      setRemovingId(null);
    }
  }

  // ── Copy to clipboard ──

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(text);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch {
      // Fallback: do nothing
    }
  }

  // ── Render ──

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Custom Domain</CardTitle>
        <CardDescription>
          Connect a custom domain to your portfolio site.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Add domain form */}
        <form onSubmit={handleAddDomain} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="domain-input">Domain Name</Label>
            <div className="flex gap-2">
              <Input
                id="domain-input"
                value={newDomain}
                onChange={(e) => {
                  setNewDomain(e.target.value);
                  setAddError(null);
                }}
                placeholder="portfolio.example.com"
                disabled={isAdding}
              />
              <Button type="submit" disabled={isAdding || !newDomain.trim()}>
                {isAdding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>

          {addError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {addError}
            </div>
          )}
        </form>

        <Separator />

        {/* Domain list */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : domains.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Globe className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No custom domains configured yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => {
              const statusConfig = getStatusConfig(domain.verificationStatus);
              const StatusIconComponent = statusConfig.icon;
              const isVerifying = verifyingId === domain.id;
              const isRemoving = removingId === domain.id;

              return (
                <div
                  key={domain.id}
                  className="rounded-md border bg-background p-4 space-y-3"
                >
                  {/* Domain header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium font-mono">
                        {domain.domain}
                      </span>
                      <Badge variant={statusConfig.variant} className="text-[10px]">
                        <StatusIconComponent className="mr-1 h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(domain.id)}
                      disabled={isRemoving}
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    >
                      {isRemoving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* DNS instructions */}
                  {domain.verificationStatus !== "verified" && (
                    <div className="rounded-md bg-muted/50 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Add the following DNS record to your domain:
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="font-medium text-muted-foreground">
                            Type
                          </span>
                          <p className="mt-0.5 font-mono">
                            {domain.dnsRecordType || "CNAME"}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">
                            Name
                          </span>
                          <p className="mt-0.5 font-mono">
                            {domain.domain.split(".")[0] || "@"}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">
                            Target
                          </span>
                          <div className="mt-0.5 flex items-center gap-1">
                            <p className="font-mono truncate">
                              {domain.dnsTarget || "your-site.pages.dev"}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  domain.dnsTarget || "your-site.pages.dev"
                                )
                              }
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {copiedTarget ===
                              (domain.dnsTarget || "your-site.pages.dev") ? (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Verify button */}
                  {domain.verificationStatus !== "verified" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerify(domain.id)}
                      disabled={isVerifying}
                    >
                      {isVerifying ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      )}
                      {isVerifying ? "Verifying..." : "Verify DNS"}
                    </Button>
                  )}

                  {/* Verified success */}
                  {domain.verificationStatus === "verified" && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Domain verified
                      {domain.verifiedAt && (
                        <span className="text-muted-foreground">
                          {" "}
                          on{" "}
                          {new Date(domain.verifiedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Failed status */}
                  {domain.verificationStatus === "failed" && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <XCircle className="h-3.5 w-3.5" />
                      DNS verification failed. Please check your DNS records and
                      try again.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
