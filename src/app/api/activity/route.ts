import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects, deployments } from "@/lib/db/schema";
import {
  deploymentEvents,
  mergeActivity,
  portfolioEvents,
  projectEvents,
} from "@/lib/activity";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/activity
 *
 * Returns a scope-to-user feed of recent portfolio/project/deployment events,
 * merged and sorted desc by occurredAt. Limit is capped at 50 to keep the
 * query bounded on chatty accounts.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(50, requested))
    : 10;

  const userId = session.user.id;

  const [portfolioRows, projectRows, deploymentRows] = await Promise.all([
    db
      .select({
        id: portfolios.id,
        name: portfolios.name,
        createdAt: portfolios.createdAt,
      })
      .from(portfolios)
      .where(eq(portfolios.userId, userId))
      .orderBy(desc(portfolios.createdAt))
      .limit(limit),
    db
      .select({
        id: projects.id,
        portfolioId: projects.portfolioId,
        displayName: projects.displayName,
        repoName: projects.repoName,
        createdAt: projects.createdAt,
        lastAnalyzed: projects.lastAnalyzed,
        pipelineStatus: projects.pipelineStatus,
      })
      .from(projects)
      .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
      .where(eq(portfolios.userId, userId))
      .orderBy(desc(projects.createdAt))
      .limit(limit),
    db
      .select({
        id: deployments.id,
        portfolioId: deployments.portfolioId,
        status: deployments.status,
        url: deployments.url,
        createdAt: deployments.createdAt,
        deployedAt: deployments.deployedAt,
      })
      .from(deployments)
      .innerJoin(portfolios, eq(deployments.portfolioId, portfolios.id))
      .where(eq(portfolios.userId, userId))
      .orderBy(desc(deployments.createdAt))
      .limit(limit),
  ]);

  const merged = mergeActivity(
    [
      ...portfolioEvents(portfolioRows),
      ...projectEvents(projectRows),
      ...deploymentEvents(deploymentRows),
    ],
    limit
  );

  return NextResponse.json({ events: merged });
}
