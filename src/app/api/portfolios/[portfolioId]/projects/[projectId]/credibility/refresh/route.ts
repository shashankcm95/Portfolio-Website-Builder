import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects, repoSources } from "@/lib/db/schema";
import { parseGitHubUrl } from "@/lib/github/url-parser";
import { getAuthenticatedGitHubClient } from "@/lib/github/authenticated-client";
import { RepoFetcher } from "@/lib/github/repo-fetcher";
import { CredibilityFetcher } from "@/lib/github/credibility-fetcher";
import type { DependencyFile } from "@/lib/github/repo-fetcher";
import { logger } from "@/lib/log";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portfolios/:portfolioId/projects/:projectId/credibility/refresh
 *
 * Re-runs the credibility-signals fetcher for a single project and writes
 * the fresh bundle + timestamp back to the DB.
 *
 * Server-side throttle: if the project's `credibilityFetchedAt` is within
 * the last 5 minutes, returns 429 to prevent abuse even if the UI button
 * is clicked rapidly. The client-side component should also throttle.
 */

const REFRESH_THROTTLE_MS = 5 * 60 * 1000;

export async function POST(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership traversal: project → portfolio → user
  const [row] = await db
    .select({
      project: projects,
      portfolioUserId: portfolios.userId,
    })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(projects.portfolioId, params.portfolioId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = row.project;

  // Manual projects have no GitHub data to refresh
  if (project.sourceType === "manual" || !project.repoUrl) {
    return NextResponse.json(
      { error: "Credibility signals only apply to GitHub projects" },
      { status: 400 }
    );
  }

  // Throttle: respect a 5-minute refresh floor
  if (project.credibilityFetchedAt) {
    const elapsed =
      Date.now() - new Date(project.credibilityFetchedAt).getTime();
    if (elapsed < REFRESH_THROTTLE_MS) {
      const retryInSec = Math.ceil((REFRESH_THROTTLE_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: "Refreshed too recently",
          retryAfterSeconds: retryInSec,
        },
        { status: 429, headers: { "Retry-After": String(retryInSec) } }
      );
    }
  }

  const parsed = parseGitHubUrl(project.repoUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: "Stored repo URL is invalid" },
      { status: 400 }
    );
  }

  // For credibility signals we need the repo metadata + dependencies. We
  // don't re-fetch the full repo-data bundle (readme/tree) — that only
  // happens on explicit /analyze. Instead we pull fresh metadata and reuse
  // the already-stored dependency files from repo_sources.
  try {
    const client = await getAuthenticatedGitHubClient(session.user.id);
    const repoFetcher = new RepoFetcher(client);
    // Refresh metadata — it's cheap (1 call) and signals like recency
    // (pushed_at) change with every commit.
    const repoData = await repoFetcher.fetchRepoData(parsed.owner, parsed.repo);

    // Reuse stored dependency rows for stack/test-framework detection.
    // Re-deriving from repoData.dependencies would be equivalent since we
    // just fetched them, but this keeps the refresh endpoint cheap if we
    // ever split metadata vs. full-fetch.
    const storedDeps: DependencyFile[] = repoData.dependencies;

    const credFetcher = new CredibilityFetcher(client);
    // Phase 8 — respect a manual category override so refreshing doesn't
    // undo the owner's choice. `auto` sources re-classify; `manual` stays
    // whatever the owner set.
    const manualOverride =
      project.projectCategorySource === "manual" &&
      project.projectCategory
        ? (project.projectCategory as any)
        : undefined;

    const signals = await credFetcher.fetchAll(
      parsed.owner,
      parsed.repo,
      repoData.metadata,
      storedDeps,
      {
        userGithubLogin: session.user.githubUsername ?? null,
        overrideCategory: manualOverride,
        overrideCategorySource: manualOverride ? "manual" : undefined,
      }
    );
    const fetchedAt = new Date();

    // Resolve the category we ended up using (manual overrides win; else
    // whatever the classifier picked). Persist only when `auto` so a manual
    // override isn't overwritten.
    const resolvedCategory =
      signals.authorshipSignal?.status === "ok"
        ? signals.authorshipSignal.presentation?.category ?? "unspecified"
        : "unspecified";

    await db
      .update(projects)
      .set({
        credibilitySignals: signals,
        credibilityFetchedAt: fetchedAt,
        repoMetadata: repoData.metadata,
        // Only update the stored category when the source is "auto" —
        // manual overrides persist across refreshes.
        ...(project.projectCategorySource !== "manual"
          ? { projectCategory: resolvedCategory }
          : {}),
      })
      .where(eq(projects.id, params.projectId));

    return NextResponse.json({
      credibilitySignals: signals,
      credibilityFetchedAt: fetchedAt.toISOString(),
    });
  } catch (error) {
    logger.error("Credibility refresh failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to refresh credibility signals" },
      { status: 500 }
    );
  }
}

// Silence an unused-import warning for `repoSources` — reserved for a
// future path that re-uses stored dep rows instead of re-fetching.
void repoSources;
