import { Plus, FolderGit2 } from "lucide-react";
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
import { PageHeader } from "@/components/layout/page-header";

// TODO: Replace with actual project data fetched by portfolioId
const projects: Array<{
  id: string;
  repoName: string;
  description: string;
  techStack: string[];
  pipelineStatus: "pending" | "analyzing" | "complete" | "error";
}> = [];

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "complete":
      return "default";
    case "analyzing":
      return "secondary";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export default function ProjectsPage({
  params,
}: {
  params: { portfolioId: string };
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Manage the projects in your portfolio."
        action={
          <Button>
            {/* TODO: Wire up add project functionality */}
            <Plus className="mr-2 h-4 w-4" />
            Add Project
          </Button>
        }
      />

      {projects.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <FolderGit2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2 text-xl">No projects yet</CardTitle>
            <CardDescription className="mb-6 text-center max-w-sm">
              Add your first GitHub project to start generating AI-powered
              portfolio content.
            </CardDescription>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Project grid */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/portfolios/${params.portfolioId}/projects/${project.id}`}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">
                      {project.repoName}
                    </CardTitle>
                    <Badge variant={getStatusVariant(project.pipelineStatus)}>
                      {project.pipelineStatus}
                    </Badge>
                  </div>
                  <CardDescription>{project.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {project.techStack.map((tech) => (
                      <Badge key={tech} variant="outline" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
