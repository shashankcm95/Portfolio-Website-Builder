"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";

// TODO: Replace with actual portfolio data fetched by portfolioId
const portfolio = {
  name: "My Portfolio",
  slug: "my-portfolio",
  status: "draft",
  template: "Minimal",
  createdAt: new Date().toLocaleDateString(),
};

export default function PortfolioDetailPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={portfolio.name}
        description={`/${portfolio.slug}`}
        action={<Badge variant="secondary">{portfolio.status}</Badge>}
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
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
                  <p className="font-medium">{portfolio.createdAt}</p>
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
                  <p className="font-medium">{portfolio.template}</p>
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
        <TabsContent value="projects">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CardTitle className="mb-2 text-lg">Projects</CardTitle>
              <CardDescription>
                Manage your portfolio projects from the projects page.
              </CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview tab */}
        <TabsContent value="preview">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CardTitle className="mb-2 text-lg">Preview</CardTitle>
              <CardDescription>
                {/* TODO: Implement portfolio preview */}
                Coming soon. Preview your portfolio before publishing.
              </CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deploy tab */}
        <TabsContent value="deploy">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CardTitle className="mb-2 text-lg">Deploy</CardTitle>
              <CardDescription>
                {/* TODO: Implement deployment functionality */}
                Coming soon. Deploy your portfolio with one click.
              </CardDescription>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Domains tab */}
        <TabsContent value="domains">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CardTitle className="mb-2 text-lg">Domains</CardTitle>
              <CardDescription>
                {/* TODO: Implement custom domain management */}
                Coming soon. Connect a custom domain to your portfolio.
              </CardDescription>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
