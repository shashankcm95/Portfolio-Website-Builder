"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Star, GitBranch } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectPipelineTab } from "@/components/pipeline/project-pipeline-tab";
import { PipelineStatus } from "@/components/pipeline/pipeline-status";
import { FactList } from "@/components/pipeline/fact-list";
import { NarrativeView } from "@/components/pipeline/narrative-view";
import { CredibilityBadges } from "@/components/github/credibility-badges";
import { AuthorshipChip } from "@/components/github/authorship-chip";
import { ImprovementSuggestions } from "@/components/github/improvement-suggestions";
import { ProjectStoryboard } from "@/components/pipeline/project-storyboard";
import { StoryboardDisclosure } from "@/components/pipeline/storyboard-disclosure";
import { ProjectDemo } from "@/components/projects/project-demo";
import { DemoForm } from "@/components/projects/demo-form";
import type { StoredCredibilitySignals } from "@/lib/credibility/types";
import type { ProjectDemo as ProjectDemoModel } from "@/lib/demos/types";

interface ProjectData {
  id: string;
  repoName: string;
  repoOwner: string;
  repoUrl: string;
  pipelineStatus: string;
  repoMetadata: {
    description?: string;
    language?: string;
    stargazers_count?: number;
    default_branch?: string;
  } | null;
  credibilitySignals?: StoredCredibilitySignals | null;
  credibilityFetchedAt?: string | null;
  demos: ProjectDemoModel[];
  facts: Array<{
    id: string;
    claim: string;
    category: string;
    confidence: number;
    evidenceType: string;
    evidenceRef: string;
    evidenceText: string;
    isVerified: boolean;
  }>;
  sections: Array<{
    id: string;
    sectionType: string;
    variant: string;
    content: string;
    isUserEdited: boolean;
    userContent?: string;
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams<{ portfolioId: string; projectId: string }>();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProject() {
    try {
      const res = await fetch(
        `/api/portfolios/${params.portfolioId}/projects/${params.projectId}`
      );
      if (res.ok) {
        const data = await res.json();
        // Flatten `{ project, facts, sections }` shape from the API.
        const flat: ProjectData = {
          ...(data.project ?? data),
          facts: data.facts ?? [],
          sections: data.sections ?? [],
          demos: data.demos ?? [],
        };
        setProject(flat);
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProject();
  }, [params.portfolioId, params.projectId]);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const meta = project.repoMetadata;

  return (
    <div className="space-y-8">
      <PageHeader
        title={project.repoName}
        description={meta?.description || ""}
        action={
          <Button variant="outline" asChild>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on GitHub
            </a>
          </Button>
        }
      />

      {/* Phase 6 — Tabs split details (default) from the Pipeline view.
          Keeps the Pipeline page single-purpose per §25 of the plan. */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-8">

      {/* Phase 2 — Authorship Signal (verdict + factor breakdown) */}
      {project.credibilitySignals?.authorshipSignal &&
        project.credibilitySignals.authorshipSignal.status === "ok" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Authorship</CardTitle>
              <CardDescription>
                Combined signal indicating whether this repo reflects
                sustained developer work or a single-burst push.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuthorshipChip
                signal={project.credibilitySignals.authorshipSignal}
              />
            </CardContent>
          </Card>
        )}

      {/* Phase 2 — Improvement suggestions (hidden for green / missing) */}
      {project.credibilitySignals?.authorshipSignal &&
        project.credibilitySignals.authorshipSignal.status === "ok" &&
        project.credibilitySignals.authorshipSignal.verdict !== "sustained" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Improve this project&apos;s score
              </CardTitle>
              <CardDescription>
                Small, actionable steps to strengthen each non-positive factor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImprovementSuggestions
                signals={project.credibilitySignals}
                portfolioId={params.portfolioId}
              />
            </CardContent>
          </Card>
        )}

      {/* Phase 1 — Credibility Signals (full layout) */}
      {project.credibilitySignals && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Credibility</CardTitle>
            <CardDescription>
              Independently verifiable signals pulled from GitHub.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CredibilityBadges signals={project.credibilitySignals} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Repository Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Repository Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {meta?.stargazers_count !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{meta.stargazers_count} stars</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{meta?.default_branch || "main"}</span>
              </div>
            </div>
            <Separator />
            {meta?.language && (
              <div>
                <p className="text-sm text-muted-foreground">Language</p>
                <Badge variant="outline" className="mt-1">
                  {meta.language}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Status */}
        <PipelineStatus
          portfolioId={params.portfolioId}
          projectId={params.projectId}
          initialStatus={project.pipelineStatus}
        />
      </div>

      {/* Facts */}
      {project.facts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extracted Facts</CardTitle>
            <CardDescription>
              AI-extracted facts verified against your codebase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FactList facts={project.facts} />
          </CardContent>
        </Card>
      )}

      {/* Phase 4 — Demo (BYO-URL / slideshow) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Demo</CardTitle>
          <CardDescription>
            Show your project running. Paste a Loom / YouTube / Vimeo URL,
            or add multiple image URLs to build a slideshow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {project.demos.length > 0 && (
            <ProjectDemo demos={project.demos} />
          )}
          <DemoForm
            portfolioId={params.portfolioId}
            projectId={params.projectId}
            initialDemos={project.demos}
            onDemosChanged={(demos) =>
              setProject((prev) => (prev ? { ...prev, demos } : prev))
            }
          />
        </CardContent>
      </Card>

      {/* Phase 3 — Guided Tour (primary) */}
      <ProjectStoryboard
        projectId={params.projectId}
        userDemos={project.demos}
      />

      {/* Phase 3 — Read more: long-form narrative, collapsed by default */}
      {project.sections.length > 0 && (
        <StoryboardDisclosure>
          <NarrativeView
            projectId={params.projectId}
            sections={project.sections}
          />
        </StoryboardDisclosure>
      )}
        </TabsContent>

        <TabsContent value="pipeline">
          <ProjectPipelineTab projectId={params.projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
