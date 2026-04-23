/**
 * Phase 10, Track D — Cancel a running pipeline.
 *
 * POST /api/portfolios/:portfolioId/projects/:projectId/pipeline/cancel
 *
 * Auth → ownership → `cancelPipeline(projectId)`. Returns 200 if a pipeline
 * was actively running and was aborted, 404 if nothing was running for
 * that project.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const { cancelPipeline } = await import("@/lib/pipeline/orchestrator");
  const aborted = cancelPipeline(project.id);

  if (!aborted) {
    return NextResponse.json(
      { error: "No pipeline is currently running for this project" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
