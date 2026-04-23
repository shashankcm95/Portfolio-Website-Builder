import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatedSections, projects, portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authorize access to a section by traversing
 * section → project → portfolio → userId. Returns the section row or an
 * error response.
 */
async function authorizeSection(projectId: string, sectionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const [row] = await db
    .select({
      section: generatedSections,
      projectId: projects.id,
      portfolioUserId: portfolios.userId,
    })
    .from(generatedSections)
    .innerJoin(projects, eq(generatedSections.projectId, projects.id))
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(generatedSections.id, sectionId),
        eq(generatedSections.projectId, projectId)
      )
    )
    .limit(1);

  if (!row) {
    return {
      error: NextResponse.json({ error: "Section not found" }, { status: 404 }),
    };
  }

  if (row.portfolioUserId !== session.user.id) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { section: row.section };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; sectionId: string } }
) {
  const authResult = await authorizeSection(params.projectId, params.sectionId);
  if ("error" in authResult) return authResult.error;

  let body: { userContent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.userContent !== "string") {
    return NextResponse.json(
      { error: "userContent (string) is required" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(generatedSections)
    .set({
      userContent: body.userContent,
      isUserEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(generatedSections.id, params.sectionId))
    .returning();

  return NextResponse.json({ section: updated });
}
