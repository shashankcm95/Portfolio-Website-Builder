import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
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
    const { projectIds } = await req.json();

    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json(
        { error: "projectIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Update display order for each project
    for (let i = 0; i < projectIds.length; i++) {
      await db
        .update(projects)
        .set({ displayOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(projects.id, projectIds[i]),
            eq(projects.portfolioId, params.portfolioId)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder projects" },
      { status: 500 }
    );
  }
}
