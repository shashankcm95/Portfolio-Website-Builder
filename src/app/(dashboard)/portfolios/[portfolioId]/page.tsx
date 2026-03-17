"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  status: string;
  templateId: string;
  createdAt: string;
}

export default function PortfolioDetailPage() {
  const params = useParams<{ portfolioId: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function fetchPortfolio() {
      try {
        const res = await fetch(`/api/portfolios/${params.portfolioId}`);
        if (res.ok) {
          const data = await res.json();
          setPortfolio(data);
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
        action={<Badge variant="secondary">{portfolio.status}</Badge>}
      />

      <Tabs defaultValue="projects" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
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

        {/* Deploy tab */}
        <TabsContent value="deploy">
          <DeployButton portfolioId={params.portfolioId} />
        </TabsContent>

        {/* Domains tab */}
        <TabsContent value="domains">
          <DomainSetup portfolioId={params.portfolioId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
