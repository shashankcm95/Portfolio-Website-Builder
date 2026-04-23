import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { isRepoCategory } from "@/lib/credibility/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/portfolios/:portfolioId/projects/:projectId/coaching
 *
 * Phase 8 — persistence endpoint for the owner's coaching decisions on a
 * project:
 *   - `category` (RepoCategory) — manual override of the auto-classified
 *     category. Always stamps `projectCategorySource: "manual"` so
 *     subsequent credibility refreshes respect the choice.
 *   - `dismissedSuggestions` (string[]) — full replacement of the stored
 *     dismissed-suggestion-id set. Client sends the array it wants to
 *     persist; server enforces uniqueness + caps length to 64 to prevent
 *     pathological payloads.
 *   - `showCharacterizationOnPortfolio` (boolean) — portfolio-side byline
 *     toggle.
 *
 * All three fields are optional; any subset may be sent. The endpoint is
 * PATCH-shaped (partial updates), not PUT.
 *
 * The Phase 8 "Decoupling guarantee" applies — nothing this endpoint writes
 * changes the *published* portfolio HTML's runtime dependencies. The
 * byline toggle controls only whether the characterization string is baked
 * into the generated files at build time; the published site itself never
 * calls back.
 */

const MAX_DISMISSED_IDS = 64;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("category" in patch) {
    const value = patch.category;
    if (!isRepoCategory(value)) {
      return NextResponse.json(
        { error: `Invalid category: ${String(value)}` },
        { status: 400 }
      );
    }
    updates.projectCategory = value;
    // A PATCH to category is always a manual override. Subsequent refreshes
    // won't re-classify.
    updates.projectCategorySource = "manual";
  }

  if ("dismissedSuggestions" in patch) {
    const value = patch.dismissedSuggestions;
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return NextResponse.json(
        { error: "dismissedSuggestions must be a string array" },
        { status: 400 }
      );
    }
    // Dedup + cap. Clients shouldn't be able to fill the column with junk
    // via a malformed patch.
    const deduped = Array.from(new Set(value as string[])).slice(
      0,
      MAX_DISMISSED_IDS
    );
    updates.dismissedSuggestions = deduped;
  }

  if ("showCharacterizationOnPortfolio" in patch) {
    const value = patch.showCharacterizationOnPortfolio;
    if (typeof value !== "boolean") {
      return NextResponse.json(
        { error: "showCharacterizationOnPortfolio must be boolean" },
        { status: 400 }
      );
    }
    updates.showCharacterizationOnPortfolio = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No known fields to update" },
      { status: 400 }
    );
  }

  // Ownership traversal: project → portfolio → user. Same shape as the
  // credibility-refresh route so we stay consistent.
  const [row] = await db
    .select({
      projectId: projects.id,
      portfolioUserId: portfolios.userId,
    })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(projects.portfolioId, params.portfolioId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updated] = await db
    .update(projects)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projects.id, params.projectId))
    .returning({
      projectCategory: projects.projectCategory,
      projectCategorySource: projects.projectCategorySource,
      dismissedSuggestions: projects.dismissedSuggestions,
      showCharacterizationOnPortfolio:
        projects.showCharacterizationOnPortfolio,
    });

  return NextResponse.json({ coaching: updated });
}
