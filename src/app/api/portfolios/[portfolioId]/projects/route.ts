import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  portfolios,
  projects,
  projectDemos,
  repoSources,
} from "@/lib/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import type { DemoType, ProjectDemo } from "@/lib/demos/types";

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

  // Phase 4: bulk-load all demos for these projects, then group by
  // projectId. One DB round-trip regardless of project count.
  const projectIds = portfolioProjects.map((p) => p.id);
  const demoRows = projectIds.length
    ? await db
        .select()
        .from(projectDemos)
        .where(inArray(projectDemos.projectId, projectIds))
        .orderBy(asc(projectDemos.order))
    : [];
  const demosByProjectId = new Map<string, ProjectDemo[]>();
  for (const r of demoRows) {
    const demo: ProjectDemo = {
      id: r.id,
      url: r.url,
      type: r.type as DemoType,
      title: r.title,
      order: r.order,
    };
    const existing = demosByProjectId.get(r.projectId);
    if (existing) existing.push(demo);
    else demosByProjectId.set(r.projectId, [demo]);
  }

  const enriched = portfolioProjects.map((p) => ({
    ...p,
    demos: demosByProjectId.get(p.id) ?? [],
  }));

  return NextResponse.json({ projects: enriched });
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
    const body = await req.json();
    const sourceType: string = body.sourceType ?? "github";

    // Compute display order once — shared across both branches
    const existingProjects = await db
      .select({ displayOrder: projects.displayOrder })
      .from(projects)
      .where(eq(projects.portfolioId, params.portfolioId));

    const maxOrder = existingProjects.reduce(
      (max, p) => Math.max(max, p.displayOrder ?? 0),
      -1
    );

    // ─── Manual (non-GitHub) project ────────────────────────────────────
    if (sourceType === "manual") {
      const {
        name,
        description,
        imageUrl,
        externalUrl,
        techStack,
      } = body as {
        name?: string;
        description?: string;
        imageUrl?: string;
        externalUrl?: string;
        techStack?: string[];
      };

      if (!name || !name.trim()) {
        return NextResponse.json(
          { error: "Project name is required" },
          { status: 400 }
        );
      }
      if (!description || !description.trim()) {
        return NextResponse.json(
          { error: "Description is required for manual projects" },
          { status: 400 }
        );
      }

      const [project] = await db
        .insert(projects)
        .values({
          portfolioId: params.portfolioId,
          sourceType: "manual",
          displayName: name.trim(),
          manualDescription: description.trim(),
          imageUrl: imageUrl?.trim() || null,
          externalUrl: externalUrl?.trim() || null,
          techStack: Array.isArray(techStack) ? techStack : [],
          displayOrder: maxOrder + 1,
          // No GitHub metadata for manual projects
          pipelineStatus: "complete", // nothing to analyze, mark ready
        })
        .returning();

      return NextResponse.json({ project }, { status: 201 });
    }

    // ─── GitHub project (existing flow) ─────────────────────────────────
    const { repoUrl } = body as { repoUrl?: string };
    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const { parseGitHubUrl } = await import("@/lib/github/url-parser");
    const parsed = parseGitHubUrl(repoUrl);

    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL" },
        { status: 400 }
      );
    }

    const { RepoFetcher } = await import("@/lib/github/repo-fetcher");
    const { getAuthenticatedGitHubClient } = await import(
      "@/lib/github/authenticated-client"
    );
    const { CredibilityFetcher } = await import(
      "@/lib/github/credibility-fetcher"
    );
    const { extractVerifiedStack } = await import(
      "@/lib/github/stack-detector"
    );

    const client = await getAuthenticatedGitHubClient(session.user.id);
    const fetcher = new RepoFetcher(client);
    const repoData = await fetcher.fetchRepoData(parsed.owner, parsed.repo);

    // Phase 1: fetch credibility signals alongside the project. Never blocks
    // the project insert — on failure we store null and let the user refresh.
    let credibilitySignals: unknown = null;
    let credibilityFetchedAt: Date | null = null;
    try {
      const credFetcher = new CredibilityFetcher(client);
      credibilitySignals = await credFetcher.fetchAll(
        parsed.owner,
        parsed.repo,
        repoData.metadata,
        repoData.dependencies
      );
      credibilityFetchedAt = new Date();
    } catch (credError) {
      console.warn(
        "Credibility fetch failed (non-fatal):",
        credError
      );
    }

    // Populate techStack from detected deps — distinct from user-declared
    // tech; "verified" in the sense that it comes from the repo itself.
    const verifiedStack = extractVerifiedStack(repoData.dependencies);

    const [project] = await db
      .insert(projects)
      .values({
        portfolioId: params.portfolioId,
        sourceType: "github",
        repoUrl,
        repoOwner: parsed.owner,
        repoName: parsed.repo,
        displayName: repoData.metadata.name,
        displayOrder: maxOrder + 1,
        repoMetadata: repoData.metadata as any,
        techStack: verifiedStack,
        credibilitySignals: credibilitySignals as any,
        credibilityFetchedAt,
      })
      .returning();

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
  } catch (error: unknown) {
    console.error("Project creation error:", error);
    return NextResponse.json(
      { error: "Failed to add project" },
      { status: 500 }
    );
  }
}
