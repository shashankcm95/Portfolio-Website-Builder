import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, deployments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "@/lib/log";

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

  // Phase R7 — defensive pre-flight: the prerequisites endpoint already
  // gates the UI button on real Cloudflare creds, but we re-check here
  // so direct API calls (curl, scripted clients) get a clean 412 instead
  // of a wrangler 7003 like
  //   "/accounts/your-cloudflare-account-id/pages/projects/... [code: 7003]"
  // which leaks the placeholder string into logs and is genuinely
  // confusing to debug.
  const PLACEHOLDERS = new Set([
    "your-cloudflare-account-id",
    "your-cloudflare-api-token",
    "your_cloudflare_account_id",
    "your_cloudflare_api_token",
    "<your-cloudflare-account-id>",
    "<your-cloudflare-api-token>",
    "changeme",
    "example",
    "placeholder",
  ]);
  const cfAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const cfApiToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (
    !cfAccountId ||
    !cfApiToken ||
    PLACEHOLDERS.has(cfAccountId.toLowerCase()) ||
    PLACEHOLDERS.has(cfApiToken.toLowerCase())
  ) {
    return NextResponse.json(
      {
        error:
          "Cloudflare credentials are not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to real values in your .env.local (the .env.example placeholders won't work).",
      },
      { status: 412 }
    );
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

    // Phase E8e — provision the Workers AI binding on the Pages project
    // BEFORE the deploy. Cloudflare scopes bindings to a deployment at
    // create time; setting the binding via API here ensures the next
    // deploy lands with `env.AI` populated. Best-effort: the deploy
    // still succeeds without the binding (the chatbot just stays in
    // "Workers AI binding missing" mode until a republish). Only run
    // for self-hosted chatbot portfolios — bindings are irrelevant
    // for the cross-origin Phase 8.5 path.
    let aiBindingWarning: string | null = null;
    if (portfolio.selfHostedChatbot && portfolio.chatbotEnabled) {
      const { provisionAiBinding } = await import(
        "@/lib/deployer/cf-pages-bindings"
      );
      const ab = await provisionAiBinding(cfProjectName);
      if (!ab.ok) {
        aiBindingWarning = ab.reason ?? "Could not configure Workers AI binding";
        logger.warn("[deploy] Workers AI binding not provisioned", {
          portfolioId: params.portfolioId,
          reason: aiBindingWarning,
        });
      }
    }

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
          logger.warn("[deploy] WAF rate-limit not provisioned", {
            portfolioId: params.portfolioId,
            reason: rateLimitWarning,
          });
        }
      } catch (err) {
        rateLimitWarning =
          err instanceof Error ? err.message : "Rate-limit hook failed";
        logger.warn("[deploy] WAF rate-limit hook crashed", {
          portfolioId: params.portfolioId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: result.success,
      deployment,
      url: result.url,
      error: result.error,
      rateLimitWarning,
      aiBindingWarning,
    });
  } catch (error: unknown) {
    logger.error("[deploy] Deployment error", {
      portfolioId: params.portfolioId,
      error: error instanceof Error ? error.message : String(error),
    });
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
