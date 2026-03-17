import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, deployments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

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
    // Generate site first
    const { generatePortfolioSite } = await import("@/lib/generator");
    const outputDir = await generatePortfolioSite(
      params.portfolioId,
      portfolio.templateId
    );

    // Deploy to Cloudflare Pages
    const { deployToCloudflare, generateProjectName } = await import(
      "@/lib/deployer/cloudflare"
    );
    const cfProjectName = generateProjectName(session.user.id, portfolio.slug);

    const result = await deployToCloudflare(outputDir, cfProjectName);

    // Record deployment
    const [deployment] = await db
      .insert(deployments)
      .values({
        portfolioId: params.portfolioId,
        cfProjectName,
        cfDeploymentId: result.deploymentId || null,
        status: result.success ? "active" : "failed",
        url: result.url || null,
        errorMessage: result.error || null,
        deployedAt: result.success ? new Date() : null,
      })
      .returning();

    // Update portfolio status
    if (result.success) {
      await db
        .update(portfolios)
        .set({ status: "deployed", updatedAt: new Date() })
        .where(eq(portfolios.id, params.portfolioId));
    }

    return NextResponse.json({
      success: result.success,
      deployment,
      url: result.url,
      error: result.error,
    });
  } catch (error: any) {
    console.error("Deployment error:", error);
    return NextResponse.json(
      { error: "Failed to deploy" },
      { status: 500 }
    );
  }
}

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

  const recentDeployments = await db
    .select()
    .from(deployments)
    .where(eq(deployments.portfolioId, params.portfolioId))
    .orderBy(desc(deployments.createdAt))
    .limit(10);

  return NextResponse.json({ deployments: recentDeployments });
}
