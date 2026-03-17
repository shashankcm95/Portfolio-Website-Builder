import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects, repoSources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify portfolio ownership
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, params.portfolioId),
        eq(portfolios.userId, session.user.id)
      )
    )
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const portfolioProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.portfolioId, params.portfolioId))
    .orderBy(projects.displayOrder);

  return NextResponse.json({ projects: portfolioProjects });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify portfolio ownership
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, params.portfolioId),
        eq(portfolios.userId, session.user.id)
      )
    )
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { repoUrl } = await req.json();

    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    // Parse and validate the URL
    const { parseGitHubUrl } = await import("@/lib/github/url-parser");
    const parsed = parseGitHubUrl(repoUrl);

    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL" },
        { status: 400 }
      );
    }

    // Fetch repo data
    const { GitHubClient } = await import("@/lib/github/client");
    const { RepoFetcher } = await import("@/lib/github/repo-fetcher");

    const client = new GitHubClient();
    const fetcher = new RepoFetcher(client);
    const repoData = await fetcher.fetchRepoData(parsed.owner, parsed.repo);

    // Get current max display order
    const existingProjects = await db
      .select({ displayOrder: projects.displayOrder })
      .from(projects)
      .where(eq(projects.portfolioId, params.portfolioId));

    const maxOrder = existingProjects.reduce(
      (max, p) => Math.max(max, p.displayOrder ?? 0),
      -1
    );

    // Create project
    const [project] = await db
      .insert(projects)
      .values({
        portfolioId: params.portfolioId,
        repoUrl,
        repoOwner: parsed.owner,
        repoName: parsed.repo,
        displayName: repoData.metadata.name,
        displayOrder: maxOrder + 1,
        repoMetadata: repoData.metadata as any,
      })
      .returning();

    // Store fetched artifacts
    const sources = [];

    if (repoData.readme) {
      sources.push({
        projectId: project.id,
        sourceType: "readme",
        content: repoData.readme.substring(0, 50000),
      });
    }

    if (repoData.fileTree.length > 0) {
      sources.push({
        projectId: project.id,
        sourceType: "file_tree",
        content: JSON.stringify(repoData.fileTree.slice(0, 1000)),
      });
    }

    for (const dep of repoData.dependencies) {
      sources.push({
        projectId: project.id,
        sourceType: dep.type,
        content: dep.content.substring(0, 50000),
      });
    }

    if (sources.length > 0) {
      await db.insert(repoSources).values(sources);
    }

    return NextResponse.json({ project, repoData: repoData.metadata }, { status: 201 });
  } catch (error: any) {
    console.error("Project creation error:", error);
    return NextResponse.json(
      { error: "Failed to add project" },
      { status: 500 }
    );
  }
}
