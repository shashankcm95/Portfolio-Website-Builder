/**
 * Phase 6 — Cross-project pipeline history for the signed-in user.
 *
 * GET /api/pipeline/history
 *   → 200 { jobs: JobSummary[], costByDay: Array<{date, costMicros}> }
 *
 * Returns the user's 50 most-recent pipeline jobs across ALL their
 * projects, plus a 30-day per-day cost rollup for the top-of-page
 * sparkline. Auth-gated via `auth()` — joins through
 * projects → portfolios → users so we only ever return the caller's
 * own history.
 */

import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  pipelineJobs,
  pipelineStepRuns,
  portfolios,
  projects,
} from "@/lib/db/schema";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const JOB_LIMIT = 50;
const COST_WINDOW_DAYS = 30;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Recent jobs (with project name) for this user.
  const jobRows = await db
    .select({
      jobId: pipelineJobs.jobId,
      projectId: pipelineJobs.projectId,
      status: pipelineJobs.status,
      error: pipelineJobs.error,
      startedAt: pipelineJobs.startedAt,
      completedAt: pipelineJobs.completedAt,
      projectName: projects.displayName,
      repoName: projects.repoName,
    })
    .from(pipelineJobs)
    .innerJoin(projects, eq(projects.id, pipelineJobs.projectId))
    .innerJoin(portfolios, eq(portfolios.id, projects.portfolioId))
    .where(eq(portfolios.userId, userId))
    .orderBy(desc(pipelineJobs.startedAt))
    .limit(JOB_LIMIT);

  // Aggregate per-job token + cost by summing step rows in JS (small N).
  const jobIds = jobRows.map((j) => j.jobId);
  const stepRows = jobIds.length
    ? await db
        .select({
          jobId: pipelineStepRuns.jobId,
          inputTokens: pipelineStepRuns.inputTokens,
          outputTokens: pipelineStepRuns.outputTokens,
          costUsdMicros: pipelineStepRuns.costUsdMicros,
          startedAt: pipelineStepRuns.startedAt,
        })
        .from(pipelineStepRuns)
        .where(
          sql`${pipelineStepRuns.jobId} IN (${sql.join(
            jobIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
    : [];

  type Agg = { inputTokens: number; outputTokens: number; costMicros: number };
  const agg = new Map<string, Agg>();
  for (const r of stepRows) {
    const cur = agg.get(r.jobId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    };
    cur.inputTokens += r.inputTokens ?? 0;
    cur.outputTokens += r.outputTokens ?? 0;
    cur.costMicros += r.costUsdMicros ?? 0;
    agg.set(r.jobId, cur);
  }

  const jobs = jobRows.map((j) => {
    const a = agg.get(j.jobId) ?? {
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    };
    const durationMs =
      j.startedAt && j.completedAt
        ? j.completedAt.getTime() - j.startedAt.getTime()
        : null;
    return {
      jobId: j.jobId,
      projectId: j.projectId,
      projectName: j.projectName || j.repoName || "Project",
      status: j.status,
      error: j.error,
      startedAt: j.startedAt.toISOString(),
      completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      durationMs,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      costMicros: a.costMicros,
    };
  });

  // 30-day cost rollup — owner's jobs only. Bucket step rows by day.
  const cutoff = new Date(Date.now() - COST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const userJobIdsSet = new Set(jobIds);
  const costByDayMap = new Map<string, number>();
  for (let i = COST_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    costByDayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of stepRows) {
    if (!userJobIdsSet.has(r.jobId)) continue;
    if (!r.startedAt || r.startedAt < cutoff) continue;
    const day = r.startedAt.toISOString().slice(0, 10);
    if (costByDayMap.has(day)) {
      costByDayMap.set(
        day,
        (costByDayMap.get(day) ?? 0) + (r.costUsdMicros ?? 0)
      );
    }
  }

  const costByDay = [...costByDayMap.entries()].map(([date, costMicros]) => ({
    date,
    costMicros,
  }));

  // Totals (also 30d).
  const totalCostMicros30d = costByDay.reduce((s, d) => s + d.costMicros, 0);

  return NextResponse.json({
    jobs,
    costByDay,
    totalCostMicros30d,
  });
}
