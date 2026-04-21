import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
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

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(projects.portfolioId, params.portfolioId)
      )
    )
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.pipelineStatus === "running") {
    return NextResponse.json(
      { error: "Analysis is already running" },
      { status: 409 }
    );
  }

  // Phase 1: refresh credibility signals alongside re-analysis. This is an
  // explicit user action ("Analyze") so we bypass the /refresh route's
  // 5-minute throttle — the user wants everything fresh now. We do this
  // *before* starting the pipeline (which is async/fire-and-forget) so the
  // signals are guaranteed-updated by the time the HTTP response returns.
  if (project.sourceType === "github" && project.repoUrl) {
    try {
      const { parseGitHubUrl } = await import("@/lib/github/url-parser");
      const parsed = parseGitHubUrl(project.repoUrl);
      if (parsed) {
        const { getAuthenticatedGitHubClient } = await import(
          "@/lib/github/authenticated-client"
        );
        const { RepoFetcher } = await import("@/lib/github/repo-fetcher");
        const { CredibilityFetcher } = await import(
          "@/lib/github/credibility-fetcher"
        );
        const client = await getAuthenticatedGitHubClient(session.user.id);
        const repoData = await new RepoFetcher(client).fetchRepoData(
          parsed.owner,
          parsed.repo
        );
        // Phase 8 — respect a manual category override on the project
        // record; otherwise re-classify from signals.
        const manualOverride =
          project.projectCategorySource === "manual" &&
          project.projectCategory
            ? (project.projectCategory as any)
            : undefined;
        const signals = await new CredibilityFetcher(client).fetchAll(
          parsed.owner,
          parsed.repo,
          repoData.metadata,
          repoData.dependencies,
          {
            userGithubLogin: (session.user as any).githubUsername ?? null,
            overrideCategory: manualOverride,
            overrideCategorySource: manualOverride ? "manual" : undefined,
          }
        );
        const resolvedCategory =
          signals.authorshipSignal?.status === "ok"
            ? signals.authorshipSignal.presentation?.category ?? "unspecified"
            : "unspecified";
        await db
          .update(projects)
          .set({
            credibilitySignals: signals as any,
            credibilityFetchedAt: new Date(),
            repoMetadata: repoData.metadata as any,
            ...(project.projectCategorySource !== "manual"
              ? { projectCategory: resolvedCategory }
              : {}),
          })
          .where(eq(projects.id, params.projectId));
      }
    } catch (credError) {
      // Non-fatal: the narrative pipeline is the primary outcome of
      // /analyze, not credibility refresh.
      console.warn("Credibility refresh during analyze failed:", credError);
    }
  }

  // Phase 3.5: pre-check LLM config before firing the async pipeline. A
  // synchronous 409 lets the client show the "Configure AI provider" CTA
  // immediately, rather than polling the async status and surfacing the
  // failure 10 seconds later.
  const { hasLlmConfigForUser } = await import(
    "@/lib/ai/providers/factory"
  );
  const configured = await hasLlmConfigForUser(session.user.id);
  if (!configured) {
    return NextResponse.json(
      {
        error:
          "No LLM provider is configured. Set one up in Settings → AI Provider.",
        code: "llm_not_configured",
      },
      { status: 409 }
    );
  }

  try {
    const { startPipeline } = await import("@/lib/pipeline/orchestrator");
    const jobId = startPipeline(project.id);

    return NextResponse.json({ jobId, status: "started" });
  } catch (error: any) {
    console.error("Analysis start error:", error);
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 }
    );
  }
}
