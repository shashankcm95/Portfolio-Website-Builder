import { ExternalLink, Star, GitBranch, Play } from "lucide-react";
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
import { PageHeader } from "@/components/layout/page-header";

// TODO: Replace with actual project data fetched by projectId
const project = {
  repoName: "example-project",
  repoUrl: "https://github.com/user/example-project",
  description: "An example project repository.",
  language: "TypeScript",
  stars: 42,
  status: "pending" as const,
};

export default function ProjectDetailPage({
  params,
}: {
  params: { portfolioId: string; projectId: string };
}) {
  return (
    <div className="space-y-8">
      {/* Project header */}
      <PageHeader
        title={project.repoName}
        description={project.description}
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
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{project.stars} stars</span>
              </div>
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">main</span>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Language</p>
              <Badge variant="outline" className="mt-1">
                {project.language}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{project.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* AI Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Analysis</CardTitle>
            <CardDescription>
              AI-extracted facts and insights from your codebase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project.status === "pending" ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-muted-foreground mb-4">
                  No analysis has been run yet. Click the button below to start.
                </p>
                <Button>
                  <Play className="mr-2 h-4 w-4" />
                  Run Analysis
                </Button>
              </div>
            ) : (
              /* TODO: Display actual AI analysis results */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Analysis results will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generated Narratives */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generated Narratives</CardTitle>
          <CardDescription>
            AI-generated content for your portfolio based on code analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {project.status === "pending" ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                {/* TODO: Show generated narratives after analysis completes */}
                Run an analysis first to generate portfolio narratives.
              </p>
            </div>
          ) : (
            /* TODO: Display actual generated narratives */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generated narratives will appear here after analysis.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
