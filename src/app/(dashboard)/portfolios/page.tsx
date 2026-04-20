"use client";

import { useEffect, useState } from "react";
import { Plus, Briefcase, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";

interface Portfolio {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPortfolios() {
      try {
        const res = await fetch("/api/portfolios");
        if (res.ok) {
          const data = await res.json();
          setPortfolios(data.portfolios ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch portfolios:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPortfolios();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Portfolios"
          description="Manage your portfolio websites."
          action={
            <Button asChild>
              <Link href="/portfolios/new">
                <Plus className="mr-2 h-4 w-4" />
                New Portfolio
              </Link>
            </Button>
          }
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Portfolios"
        description="Manage your portfolio websites."
        action={
          <Button asChild>
            <Link href="/portfolios/new">
              <Plus className="mr-2 h-4 w-4" />
              New Portfolio
            </Link>
          </Button>
        }
      />

      {portfolios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2 text-xl">No portfolios yet</CardTitle>
            <CardDescription className="mb-6 text-center max-w-sm">
              Create your first portfolio to showcase your projects with
              AI-generated narratives backed by code evidence.
            </CardDescription>
            <Button asChild>
              <Link href="/portfolios/new">
                <Plus className="mr-2 h-4 w-4" />
                Create your first portfolio
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                    <Badge variant="secondary">{portfolio.status}</Badge>
                  </div>
                  <CardDescription>/{portfolio.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(portfolio.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
