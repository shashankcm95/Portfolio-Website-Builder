/**
 * Phase 7 — Layout review endpoint.
 *
 * POST /api/portfolios/:portfolioId/layout-review
 *   body (optional): { enableAiTier?: boolean }
 *   → 201 { review: LayoutReviewSummary }   newly started OR returned
 *                                            existing-running row
 *   → 401 / 403 / 404 on auth / ownership / not-found
 *
 * GET  /api/portfolios/:portfolioId/layout-review
 *   → 200 { review: LayoutReviewSummary | null }   most-recent run
 *
 * Concurrency: at most one review with status="running" per portfolio.
 * A second POST while one is running returns the existing row instead
 * of starting a new one — the UI polls GET to see progress.
 *
 * The runner itself is fire-and-forget — POST returns as soon as the
 * `layout_reviews` row is inserted; the runner finishes asynchronously
 * and updates the row.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  layoutReviewIssues,
  layoutReviews,
  portfolios,
} from "@/lib/db/schema";
import { runLayoutReview } from "@/lib/review/runner";
import type {
  LayoutIssue,
  LayoutReviewSummary,
} from "@/lib/review/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


// Intentionally does NOT use the shared `authorizePortfolio` helper —
// this route piggybacks the `templateId` fetch onto the same ownership
// lookup, saving a round-trip. The return shape `{ portfolio }` differs
// from the shared helper's `{ userId }` on purpose. See Phase R2 commit.
async function authorize(portfolioId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const [row] = await db
    .select({
      id: portfolios.id,
      userId: portfolios.userId,
      templateId: portfolios.templateId,
    })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!row) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if (row.userId !== session.user.id) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { portfolio: row };
}

async function loadSummary(
  reviewId: string
): Promise<LayoutReviewSummary | null> {
  const [row] = await db
    .select()
    .from(layoutReviews)
    .where(eq(layoutReviews.id, reviewId))
    .limit(1);
  if (!row) return null;

  const issues = await db
    .select()
    .from(layoutReviewIssues)
    .where(eq(layoutReviewIssues.reviewId, reviewId));

  return {
    id: row.id,
    portfolioId: row.portfolioId,
    templateId: row.templateId,
    status: row.status as LayoutReviewSummary["status"],
    score: row.score,
    issues: issues.map((i) => ({
      rule: i.rule,
      tier: i.tier as LayoutIssue["tier"],
      severity: i.severity as LayoutIssue["severity"],
      message: i.message,
      page: i.page ?? undefined,
      viewport: i.viewport ?? undefined,
      elementSelector: i.elementSelector ?? undefined,
      details: (i.details as Record<string, unknown> | null) ?? undefined,
    })),
    tier2Available: row.tier2Available,
    tier3Available: row.tier3Available,
    aiSummary: row.aiSummary,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    error: row.error,
  };
}

// ─── POST — start (or return existing running) ──────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const auth = await authorize(params.portfolioId);
  if ("error" in auth) return auth.error;

  let body: { enableAiTier?: boolean } = {};
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Dedupe: if there's already a running review for this portfolio,
  // return that row instead of starting a new one.
  const [existing] = await db
    .select()
    .from(layoutReviews)
    .where(
      and(
        eq(layoutReviews.portfolioId, params.portfolioId),
        eq(layoutReviews.status, "running")
      )
    )
    .limit(1);
  if (existing) {
    const summary = await loadSummary(existing.id);
    return NextResponse.json({ review: summary }, { status: 200 });
  }

  // Insert the new review row up front so the UI can poll it
  // immediately by id.
  const startedAt = new Date();
  const [inserted] = await db
    .insert(layoutReviews)
    .values({
      portfolioId: params.portfolioId,
      templateId: auth.portfolio.templateId ?? "minimal",
      status: "running",
      startedAt,
    })
    .returning({ id: layoutReviews.id });

  // Fire-and-forget. We await the runner here so the response carries
  // the final summary — Tier 1 only is fast (<1s), so blocking the
  // request is fine. When Tier 2 (Playwright) lands, this should
  // become genuinely async (return 201 + status=running, runner runs
  // in background).
  const summary = await runLayoutReview(inserted.id, {
    portfolioId: params.portfolioId,
    enableAiTier: Boolean(body.enableAiTier),
  });

  return NextResponse.json({ review: summary }, { status: 201 });
}

// ─── GET — most-recent review ──────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const auth = await authorize(params.portfolioId);
  if ("error" in auth) return auth.error;

  const [row] = await db
    .select({ id: layoutReviews.id })
    .from(layoutReviews)
    .where(eq(layoutReviews.portfolioId, params.portfolioId))
    .orderBy(desc(layoutReviews.startedAt))
    .limit(1);

  if (!row) return NextResponse.json({ review: null });

  const summary = await loadSummary(row.id);
  return NextResponse.json({ review: summary });
}
