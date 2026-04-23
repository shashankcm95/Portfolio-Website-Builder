"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Eye, Loader2, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { RepoAddForm } from "@/components/github/repo-add-form";
import { RepoList } from "@/components/github/repo-list";
import { DeployButton } from "@/components/deploy/deploy-button";
import { DomainSetup } from "@/components/deploy/domain-setup";
import { PortfolioSettings } from "@/components/portfolio/portfolio-settings";
import { ChatbotSettings } from "@/components/portfolio/chatbot-settings";
import { ShareLinksCard } from "@/components/portfolio/share-links-card";
import { PortfolioAnalytics } from "@/components/portfolio/portfolio-analytics";
import { LayoutReviewPanel } from "@/components/portfolio/layout-review-panel";
import { IdentityPitchCard } from "@/components/portfolio/identity-pitch-card";
import { TestimonialsCard } from "@/components/portfolio/testimonials-card";

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateId: string;
  createdAt: string;
  chatbotEnabled?: boolean;
  chatbotGreeting?: string | null;
  chatbotStarters?: string[];
}

const TAB_VALUES = [
  "overview",
  "projects",
  "identity",
  "preview",
  "deploy",
  "domains",
  "analytics",
  "settings",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

export default function PortfolioDetailPage() {
  const params = useParams<{ portfolioId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Phase 6 UX polish — `?tab=<value>` makes deep-links from the
  // onboarding checklist + share-friendly in-app URLs work. Invalid
  // values fall through to the default landing tab.
  const activeTab: TabValue = useMemo(() => {
    const q = searchParams.get("tab");
    return (TAB_VALUES as readonly string[]).includes(q ?? "")
      ? (q as TabValue)
      : "projects";
  }, [searchParams]);

  const setActiveTab = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "projects") sp.delete("tab");
      else sp.set("tab", next);
      const qs = sp.toString();
      router.replace(
        `/portfolios/${params.portfolioId}${qs ? `?${qs}` : ""}`,
        { scroll: false }
      );
    },
    [params.portfolioId, router, searchParams]
  );

  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const res = await fetch(`/api/portfolios/${params.portfolioId}`);
        if (res.ok) {
          const data = await res.json();
          // API returns { portfolio, projects } — extract the portfolio object
          setPortfolio(data.portfolio ?? data);
        }
      } catch (err) {
        console.error("Failed to fetch portfolio:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolio();
  }, [params.portfolioId]);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Portfolio not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={portfolio.name}
        description={`/${portfolio.slug}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{portfolio.status}</Badge>
            {/* Phase 6 UX — Share is buried in the Settings tab; this
                header-level shortcut deep-links the owner to the
                ShareLinksCard in one click. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("settings")}
              data-testid="portfolio-share-shortcut"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="identity">Identity &amp; pitch</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Portfolio Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{portfolio.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="secondary">{portfolio.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(portfolio.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Active Template</p>
                  <p className="font-medium">{portfolio.templateId || "Minimal"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-sm">
                    A clean, minimal portfolio template focused on content and
                    readability.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Projects tab */}
        <TabsContent value="projects" className="space-y-6">
          <RepoAddForm
            portfolioId={params.portfolioId}
            onProjectAdded={() => setRefreshKey((k) => k + 1)}
          />
          <RepoList
            key={refreshKey}
            portfolioId={params.portfolioId}
          />
        </TabsContent>

        {/* Phase C — Identity & pitch tab.
            Tier-1 editor: positioning, named employers, hire status +
            CTA, anchor stat override + testimonials list. All user-authored
            content that doesn't go through the proof-backed pipeline. */}
        <TabsContent value="identity" className="space-y-6">
          <IdentityPitchCard portfolioId={params.portfolioId} />
          <TestimonialsCard portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Preview tab — combines Phase 6.1 "Share this preview" shortcut
            with the Phase 7 LayoutReviewPanel below the iframe. */}
        <TabsContent value="preview" className="space-y-6">
          <PreviewPanel
            portfolioId={params.portfolioId}
            onShare={() => setActiveTab("settings")}
          />
          <LayoutReviewPanel portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Deploy tab */}
        <TabsContent value="deploy">
          <DeployButton portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Domains tab */}
        <TabsContent value="domains">
          <DomainSetup portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Phase 6 — Analytics tab (dedicated, full-width) */}
        <TabsContent value="analytics">
          <PortfolioAnalytics portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="space-y-6">
          {/* Phase 6 UX — ShareLinksCard leads because the header's
              Share shortcut lands here; it's the primary action users
              expect to find on this tab. PortfolioSettings (name /
              slug / template) is secondary. */}
          <ShareLinksCard portfolioId={portfolio.id} />
          <PortfolioSettings
            portfolio={portfolio}
            onUpdated={(updated) =>
              setPortfolio((prev) => (prev ? { ...prev, ...updated } : updated as Portfolio))
            }
          />
          <ChatbotSettings
            portfolioId={portfolio.id}
            chatbotEnabled={portfolio.chatbotEnabled ?? true}
            chatbotGreeting={portfolio.chatbotGreeting ?? null}
            chatbotStarters={portfolio.chatbotStarters ?? []}
            onEnabledChange={(enabled) =>
              setPortfolio((prev) => (prev ? { ...prev, chatbotEnabled: enabled } : prev))
            }
            onCustomizationChange={(next) =>
              setPortfolio((prev) =>
                prev
                  ? {
                      ...prev,
                      chatbotGreeting: next.greeting,
                      chatbotStarters: next.starters,
                    }
                  : prev
              )
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Preview Panel ──────────────────────────────────────────────────────────

function PreviewPanel({
  portfolioId,
  onShare,
}: {
  portfolioId: string;
  /** Phase 6 UX — "Share this preview" jumps to the Settings tab's ShareLinksCard. */
  onShare?: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [currentPage, setCurrentPage] = useState("index");

  const previewUrl = `/api/portfolios/${portfolioId}/preview?page=${currentPage}&t=${previewKey}`;

  const pages = [
    { label: "Home", value: "index" },
    { label: "About", value: "about" },
    { label: "Projects", value: "projects" },
    { label: "Contact", value: "contact" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Site Preview</CardTitle>
        <CardDescription>
          Preview your generated portfolio site before deploying.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showPreview ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Eye className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Preview your portfolio</p>
              <p className="text-xs text-muted-foreground">
                Generate a live preview from your resume and project data.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Page navigation */}
            <div className="flex items-center gap-2 flex-wrap">
              {pages.map((page) => (
                <Button
                  key={page.value}
                  variant={currentPage === page.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page.value)}
                >
                  {page.label}
                </Button>
              ))}
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewKey((k) => k + 1)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open
                </a>
              </Button>
              {onShare && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onShare}
                  data-testid="preview-share-shortcut"
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Share this preview
                </Button>
              )}
            </div>

            {/* Preview iframe */}
            <div className="rounded-lg border bg-white overflow-hidden">
              <iframe
                key={previewKey + currentPage}
                src={previewUrl}
                className="w-full border-0"
                style={{ height: "70vh" }}
                title="Portfolio Preview"
              />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => {
            setShowPreview(true);
            setPreviewKey((k) => k + 1);
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          {showPreview ? "Regenerate Preview" : "Generate Preview"}
        </Button>
      </CardFooter>
    </Card>
  );
}
