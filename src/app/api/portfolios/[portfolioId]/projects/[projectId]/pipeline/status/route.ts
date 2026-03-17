import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
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

  // Get pipeline status from orchestrator
  try {
    const { getStatus } = await import("@/lib/pipeline/orchestrator");
    const status = getStatus(project.id);

    return NextResponse.json({
      pipelineStatus: project.pipelineStatus,
      pipelineError: project.pipelineError,
      lastAnalyzed: project.lastAnalyzed,
      ...(status || {}),
    });
  } catch {
    return NextResponse.json({
      pipelineStatus: project.pipelineStatus,
      pipelineError: project.pipelineError,
      lastAnalyzed: project.lastAnalyzed,
    });
  }
}
