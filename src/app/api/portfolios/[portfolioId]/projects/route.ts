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
import { RepoFetcher } from "@/lib/github/repo-fetcher";
import { getAuthenticatedGitHubClient } from "@/lib/github/authenticated-client";
import { CredibilityFetcher } from "@/lib/github/credibility-fetcher";
import { extractVerifiedStack } from "@/lib/github/stack-detector";

// ─── importSingleRepo (Phase 10 Track A) ────────────────────────────────────
//
// Extracted from the original single-repo POST body so the new batch
// endpoint (`.../projects/import`) can reuse the exact same insert logic.
// Behavior-preserving end-to-end — credibility fetch + Phase-8 category
// classification + verified-stack extraction + repoSources bulk-insert
// all match the pre-refactor version byte-for-byte.

export interface ImportSingleRepoOptions {
  /** The user issuing the import — used for the authenticated GitHub client. */
  userId: string;
  /** Owner's GitHub login — enables the Phase-8 category classifier. */
  userGithubLogin?: string | null;
  /**
   * Pre-computed displayOrder for the new row. When omitted, the helper
   * queries for the current max within the portfolio. The batch path
   * always passes an explicit order so it can assign sequential slots
   * per-repo without N round-trips.
   */
  displayOrder?: number;
}

export interface ImportSingleRepoResult {
  project: { id: string; repoName: string | null } & Record<string, unknown>;
  repoMetadata: { name: string; fullName: string };
}

export async function importSingleRepo(
  portfolioId: string,
  owner: string,
  repo: string,
  opts: ImportSingleRepoOptions
): Promise<ImportSingleRepoResult> {
  const client = await getAuthenticatedGitHubClient(opts.userId);
  const fetcher = new RepoFetcher(client);
  const repoData = await fetcher.fetchRepoData(owner, repo);

  // Phase 1: Credibility signals — never fatal. Phase 8: also classifies
  // the repo (personal_learning / personal_tool / oss_author /
  // oss_contributor / unspecified) so the coaching UI + portfolio byline
  // pick up the right category on first load.
  let credibilitySignals: unknown = null;
  let credibilityFetchedAt: Date | null = null;
  let initialCategory: string = "unspecified";
  try {
    const credFetcher = new CredibilityFetcher(client);
    const bundle = await credFetcher.fetchAll(
      owner,
      repo,
      repoData.metadata,
      repoData.dependencies,
      {
        userGithubLogin: opts.userGithubLogin ?? null,
      }
    );
    credibilitySignals = bundle;
    credibilityFetchedAt = new Date();
    initialCategory =
      bundle.authorshipSignal?.status === "ok"
        ? bundle.authorshipSignal.presentation?.category ?? "unspecified"
        : "unspecified";
  } catch (credError) {
    console.warn("Credibility fetch failed (non-fatal):", credError);
  }

  const verifiedStack = extractVerifiedStack(repoData.dependencies);

  let displayOrder = opts.displayOrder;
  if (displayOrder === undefined) {
    const existingProjects = await db
      .select({ displayOrder: projects.displayOrder })
      .from(projects)
      .where(eq(projects.portfolioId, portfolioId));
    const maxOrder = existingProjects.reduce(
      (max, p) => Math.max(max, p.displayOrder ?? 0),
      -1
    );
    displayOrder = maxOrder + 1;
  }

  const [project] = await db
    .insert(projects)
    .values({
      portfolioId,
      sourceType: "github",
      repoUrl: repoData.metadata.htmlUrl,
      repoOwner: owner,
      repoName: repo,
      displayName: repoData.metadata.name,
      displayOrder,
      repoMetadata: repoData.metadata as any,
      techStack: verifiedStack,
      credibilitySignals: credibilitySignals as any,
      credibilityFetchedAt,
      // Phase 8 — persist the classifier result so the coaching UI has
      // something to read without re-classifying on every page load.
      projectCategory: initialCategory,
      projectCategorySource: "auto",
      // Default the portfolio-characterization toggle on for flattering
      // categories; leave it off for `personal_learning` and
      // `oss_contributor` where the byline may read less favorably.
      showCharacterizationOnPortfolio:
        initialCategory === "personal_tool" ||
        initialCategory === "oss_author",
    })
    .returning();

  const sources: Array<{
    projectId: string;
    sourceType: string;
    content: string;
  }> = [];

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

  return {
    project: project as ImportSingleRepoResult["project"],
    repoMetadata: {
      name: repoData.metadata.name,
      fullName: repoData.metadata.fullName,
    },
  };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          pipelineStatus: "complete", // nothing to analyze, mark ready
        })
        .returning();

      return NextResponse.json({ project }, { status: 201 });
    }

    // ─── GitHub project (delegated to importSingleRepo helper) ──────────
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

    const result = await importSingleRepo(
      params.portfolioId,
      parsed.owner,
      parsed.repo,
      {
        userId: session.user.id,
        userGithubLogin: (session.user as any).githubUsername ?? null,
        displayOrder: maxOrder + 1,
      }
    );

    return NextResponse.json(
      { project: result.project, repoData: result.repoMetadata },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Project creation error:", error);
    return NextResponse.json(
      { error: "Failed to add project" },
      { status: 500 }
    );
  }
}
