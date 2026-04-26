import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects, projectDemos } from "@/lib/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import type { DemoType, ProjectDemo } from "@/lib/demos/types";
import { importSingleRepo } from "@/lib/projects/import-single-repo";
import { logger } from "@/lib/log";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `importSingleRepo` lives in `@/lib/projects/import-single-repo` so this
// file only exports the App Router handlers Next.js permits. Any non-handler
// export here trips the generated `.next/types/.../route.ts` compatibility
// check and breaks `npm run typecheck`.

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

  // Naturally bounded: scoped to a single portfolio the caller owns, and
  // project counts per portfolio are UI-capped well below any scan concern.
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
        userGithubLogin: session.user.githubUsername ?? null,
        displayOrder: maxOrder + 1,
      }
    );

    return NextResponse.json(
      { project: result.project, repoData: result.repoMetadata },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Project creation error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to add project" },
      { status: 500 }
    );
  }
}
