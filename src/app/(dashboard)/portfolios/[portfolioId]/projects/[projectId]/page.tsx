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
import { PageHeader } from "@/components/layout/page-header";
import { PipelineStatus } from "@/components/pipeline/pipeline-status";
import { FactList } from "@/components/pipeline/fact-list";
import { NarrativeView } from "@/components/pipeline/narrative-view";

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
        setProject(data);
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

      {/* Generated Narratives */}
      {project.sections.length > 0 && (
        <NarrativeView
          projectId={params.projectId}
          sections={project.sections}
        />
      )}
    </div>
  );
}
