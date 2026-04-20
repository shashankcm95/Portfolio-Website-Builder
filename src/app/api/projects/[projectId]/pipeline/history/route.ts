/**
 * Phase 6 — Per-project pipeline history.
 *
 * GET /api/projects/:projectId/pipeline/history
 *   → 200 { jobs: JobWithSteps[] }
 *
 * Returns the last 20 jobs for this project, with the full step
 * breakdown inline so the Pipeline tab can render a single request per
 * view. Auth-gated: the project must belong to the caller.
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

export const runtime = "nodejs";

const JOB_LIMIT = 20;

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check: project → portfolio → user.
  const [owned] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(portfolios, eq(portfolios.id, projects.portfolioId))
    .where(eq(projects.id, params.projectId))
    .limit(1);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [ownership] = await db
    .select({ userId: portfolios.userId })
    .from(projects)
    .innerJoin(portfolios, eq(portfolios.id, projects.portfolioId))
    .where(eq(projects.id, params.projectId))
    .limit(1);
  if (!ownership || ownership.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobRows = await db
    .select()
    .from(pipelineJobs)
    .where(eq(pipelineJobs.projectId, params.projectId))
    .orderBy(desc(pipelineJobs.startedAt))
    .limit(JOB_LIMIT);

  const jobIds = jobRows.map((j) => j.jobId);
  const stepRows = jobIds.length
    ? await db
        .select()
        .from(pipelineStepRuns)
        .where(
          sql`${pipelineStepRuns.jobId} IN (${sql.join(
            jobIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .orderBy(pipelineStepRuns.startedAt)
    : [];

  // Group steps by jobId.
  const stepsByJob = new Map<string, typeof stepRows>();
  for (const r of stepRows) {
    const cur = stepsByJob.get(r.jobId) ?? [];
    cur.push(r);
    stepsByJob.set(r.jobId, cur);
  }

  const jobs = jobRows.map((j) => ({
    jobId: j.jobId,
    status: j.status,
    error: j.error,
    startedAt: j.startedAt.toISOString(),
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    durationMs:
      j.completedAt ? j.completedAt.getTime() - j.startedAt.getTime() : null,
    steps: (stepsByJob.get(j.jobId) ?? []).map((s) => ({
      id: s.id,
      stepName: s.stepName,
      status: s.status,
      error: s.error,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      durationMs:
        s.startedAt && s.completedAt
          ? s.completedAt.getTime() - s.startedAt.getTime()
          : null,
      modelUsed: s.modelUsed,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      costMicros: s.costUsdMicros,
    })),
  }));

  return NextResponse.json({ jobs });
}
