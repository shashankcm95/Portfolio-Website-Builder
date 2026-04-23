import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, deployments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

    // Phase 9 — When a self-hosted chatbot portfolio lands, best-effort
    // provision a WAF rate-limit rule against /api/chat/*. Failures are
    // logged but never block the deploy — the chatbot works without the
    // rule; it's just an abuse-protection layer.
    let rateLimitWarning: string | null = null;
    if (
      result.success &&
      result.url &&
      portfolio.selfHostedChatbot &&
      portfolio.chatbotEnabled
    ) {
      try {
        const { provisionChatRateLimit } = await import(
          "@/lib/deployer/cf-waf-rate-limit"
        );
        const rl = await provisionChatRateLimit({
          deployUrl: result.url,
          pagesProjectName: cfProjectName,
        });
        if (!rl.ok) {
          rateLimitWarning = rl.reason ?? "Rate-limit provisioning failed";
          console.warn(
            "[deploy] WAF rate-limit not provisioned:",
            rateLimitWarning
          );
        }
      } catch (err) {
        rateLimitWarning =
          err instanceof Error ? err.message : "Rate-limit hook failed";
        console.warn("[deploy] WAF rate-limit hook crashed:", err);
      }
    }

    return NextResponse.json({
      success: result.success,
      deployment,
      url: result.url,
      error: result.error,
      rateLimitWarning,
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
