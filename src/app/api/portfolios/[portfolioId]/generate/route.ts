import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  try {
    // Update status
    await db
      .update(portfolios)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(portfolios.id, params.portfolioId));

    // Generate site
    const { generatePortfolioSite } = await import("@/lib/generator");
    const outputDir = await generatePortfolioSite(
      params.portfolioId,
      portfolio.templateId
    );

    // Update status
    await db
      .update(portfolios)
      .set({ status: "generated", updatedAt: new Date() })
      .where(eq(portfolios.id, params.portfolioId));

    return NextResponse.json({
      success: true,
      outputDir,
      status: "generated",
    });
  } catch (error: any) {
    console.error("Site generation error:", error);

    await db
      .update(portfolios)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(portfolios.id, params.portfolioId));

    return NextResponse.json(
      { error: "Failed to generate site" },
      { status: 500 }
    );
  }
}
