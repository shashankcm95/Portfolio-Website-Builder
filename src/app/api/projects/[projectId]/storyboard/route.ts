import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { loadStoryboard } from "@/lib/pipeline/steps/storyboard-generate";

/**
 * GET /api/projects/:projectId/storyboard
 *
 * Returns the current storyboard payload for a project (user-edited content
 * preferred over generated content). 404 when no storyboard has been
 * generated yet — detail page handles this by showing a skeleton / retry
 * button instead of erroring.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership traversal: project → portfolio → user
  const [row] = await db
    .select({
      projectId: projects.id,
      portfolioUserId: portfolios.userId,
    })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(eq(projects.id, params.projectId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stored = await loadStoryboard(params.projectId);
  if (!stored) {
    return NextResponse.json(
      { storyboard: null, error: "No storyboard generated yet" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    storyboard: stored.payload,
    isUserEdited: stored.isUserEdited,
    updatedAt: stored.updatedAt?.toISOString() ?? null,
  });
}
