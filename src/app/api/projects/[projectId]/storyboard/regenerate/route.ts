import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatedSections, portfolios, projects } from "@/lib/db/schema";
import { runStoryboardGenerate } from "@/lib/pipeline/steps/storyboard-generate";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
} from "@/lib/ai/providers/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/projects/:projectId/storyboard/regenerate
 *
 * Re-runs the storyboard-generate step for a single project, upserting the
 * row. Synchronous: this takes ~5-10 seconds (one LLM call). The client
 * shows a spinner.
 *
 * Throttle: refuse regenerate if the storyboard row was updated <30s ago.
 * Prevents accidental double-clicks from burning LLM budget.
 */
const REFRESH_THROTTLE_MS = 30 * 1000;

export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership
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

  // Throttle
  const [existing] = await db
    .select({
      updatedAt: generatedSections.updatedAt,
    })
    .from(generatedSections)
    .where(eq(generatedSections.projectId, params.projectId))
    .limit(1);
  if (existing?.updatedAt) {
    const elapsed = Date.now() - new Date(existing.updatedAt).getTime();
    if (elapsed < REFRESH_THROTTLE_MS) {
      const retryInSec = Math.ceil((REFRESH_THROTTLE_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: "Regenerated too recently",
          retryAfterSeconds: retryInSec,
        },
        { status: 429, headers: { "Retry-After": String(retryInSec) } }
      );
    }
  }

  let result;
  try {
    result = await runStoryboardGenerate(params.projectId);
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: "llm_not_configured" },
        { status: 409 }
      );
    }
    if (err instanceof LlmInvalidKeyError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "llm_invalid_key",
          provider: err.provider,
        },
        { status: 409 }
      );
    }
    throw err;
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ storyboard: result.payload });
}
