/**
 * Phase 7 — Layout review runner.
 *
 * Single entry point: `runLayoutReview(portfolioId)`. Synchronously
 * starts a review (DB row + Tier 1 results in <1s for typical inputs);
 * Tier 2 + 3 are stubs in v1 (require Playwright runtime + an LLM
 * vision pass — both deferred per the Phase 7 plan's §B14-16). The
 * runner persists everything to `layout_reviews` + `layout_review_issues`
 * so the UI can poll progress.
 *
 * Concurrency: at most one running review per portfolio (the route
 * dedupes on status="running" before invoking us).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  layoutReviewIssues,
  layoutReviews,
  portfolios,
} from "@/lib/db/schema";
import { assembleProfileData } from "@/lib/generator/profile-data";
import { renderTemplate } from "@/lib/generator/renderer";
import { runStaticChecks } from "./rules-static";
import { computeScore } from "./scoring";
import type { LayoutIssue, LayoutReviewSummary } from "./types";

export interface RunReviewInput {
  portfolioId: string;
  /** Whether the owner opted into Tier 3 (AI vision review). */
  enableAiTier?: boolean;
}

/**
 * Run a full review and write results to the DB. Returns the final
 * summary. Failures are caught and persisted as status="failed" with
 * the error message — never re-thrown to the caller, so the
 * fire-and-forget HTTP path is safe.
 */
export async function runLayoutReview(
  reviewRowId: string,
  input: RunReviewInput
): Promise<LayoutReviewSummary> {
  const startedAt = new Date();

  try {
    // Resolve template id for the portfolio (the row was inserted with
    // a "running" status; the template id is needed for the runner +
    // for the response shape).
    const [portfolio] = await db
      .select({
        id: portfolios.id,
        templateId: portfolios.templateId,
      })
      .from(portfolios)
      .where(eq(portfolios.id, input.portfolioId))
      .limit(1);
    if (!portfolio) {
      throw new Error(`Portfolio ${input.portfolioId} not found`);
    }

    // Render the site map.
    const profileData = await assembleProfileData(input.portfolioId);
    const files = await renderTemplate(
      portfolio.templateId ?? "minimal",
      profileData
    );

    // Tier 1 — static.
    const staticIssues: LayoutIssue[] = runStaticChecks(files);

    // Tier 2 — rendered (Playwright). Stubbed in v1; ships when
    // playwright runtime is wired. Returns an empty issue list +
    // tier2Available=false.
    const tier2 = await runRenderedTierStub();

    // Tier 3 — AI vision. Opt-in. Stubbed in v1.
    const tier3 = input.enableAiTier
      ? await runAiTierStub()
      : { issues: [] as LayoutIssue[], available: false, summary: null };

    const allIssues = [...staticIssues, ...tier2.issues, ...tier3.issues];
    const score = computeScore(allIssues);
    const completedAt = new Date();

    // Persist.
    await db
      .update(layoutReviews)
      .set({
        status: "completed",
        score,
        tier2Available: tier2.available,
        tier3Available: tier3.available,
        aiSummary: tier3.summary,
        completedAt,
      })
      .where(eq(layoutReviews.id, reviewRowId));

    if (allIssues.length > 0) {
      await db.insert(layoutReviewIssues).values(
        allIssues.map((issue) => ({
          reviewId: reviewRowId,
          rule: issue.rule,
          tier: issue.tier,
          severity: issue.severity,
          message: issue.message,
          page: issue.page ?? null,
          viewport: issue.viewport ?? null,
          elementSelector: issue.elementSelector ?? null,
          details: issue.details ?? null,
        }))
      );
    }

    return {
      id: reviewRowId,
      portfolioId: input.portfolioId,
      templateId: portfolio.templateId ?? "minimal",
      status: "completed",
      score,
      issues: allIssues,
      tier2Available: tier2.available,
      tier3Available: tier3.available,
      aiSummary: tier3.summary,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown review error";
    // Mark the row failed; let the response surface the error.
    try {
      await db
        .update(layoutReviews)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(layoutReviews.id, reviewRowId));
    } catch {
      // best-effort
    }
    return {
      id: reviewRowId,
      portfolioId: input.portfolioId,
      templateId: "unknown",
      status: "failed",
      score: null,
      issues: [],
      tier2Available: false,
      tier3Available: false,
      aiSummary: null,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      error: message,
    };
  }
}

// ─── Tier 2/3 stubs (deferred implementations) ──────────────────────────────

/**
 * Tier 2 stub: returns no issues + available=false. The full
 * implementation needs Playwright + browser binaries (~150-300MB) and
 * isn't deployable on Vercel serverless. When wired, it'll lazy-import
 * `playwright`, render each HTML page at REVIEW_VIEWPORTS, run R10-R17,
 * and report. Scaffolded as a separate function so the runner doesn't
 * need to change when Tier 2 ships.
 */
async function runRenderedTierStub(): Promise<{
  issues: LayoutIssue[];
  available: boolean;
}> {
  return { issues: [], available: false };
}

/**
 * Tier 3 stub: AI vision review. When wired, it'll screenshot each
 * page via Playwright then call `llmClient.measuredStructured()` with
 * a {issues, score, summary} schema. Gated by env var
 * `LAYOUT_REVIEW_AI_ENABLED=1` and the owner's per-review opt-in.
 */
async function runAiTierStub(): Promise<{
  issues: LayoutIssue[];
  available: boolean;
  summary: string | null;
}> {
  return { issues: [], available: false, summary: null };
}
