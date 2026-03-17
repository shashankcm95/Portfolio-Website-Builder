import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function getAuthenticatedPortfolio(portfolioId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, portfolioId), eq(portfolios.userId, session.user.id))
    )
    .limit(1);

  if (!portfolio) return { error: "Not found", status: 404 };
  return { portfolio, userId: session.user.id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const portfolioProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.portfolioId, result.portfolio.id))
    .orderBy(projects.displayOrder);

  return NextResponse.json({
    portfolio: result.portfolio,
    projects: portfolioProjects,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const updates = await req.json();
  const allowedFields = ["name", "slug", "templateId", "settings", "status"];
  const filteredUpdates: Record<string, any> = {};

  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }
  filteredUpdates.updatedAt = new Date();

  const [updated] = await db
    .update(portfolios)
    .set(filteredUpdates)
    .where(eq(portfolios.id, params.portfolioId))
    .returning();

  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  await db.delete(portfolios).where(eq(portfolios.id, params.portfolioId));

  return NextResponse.json({ success: true });
}
