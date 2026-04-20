/**
 * Phase 6 — Pipeline job/step history writes.
 *
 * The orchestrator's live state stays in-memory (as it was in Phase 1);
 * this module persists a durable *history* of jobs + steps + LLM usage
 * for the observability dashboards. Every function here is strictly
 * fire-and-forget — a failing DB must never break the pipeline.
 *
 * Owns:
 *   - `recordJobStart`       insert a `pipeline_jobs` row
 *   - `recordJobFinish`      update the row with status + completedAt
 *   - `recordStepStart`      insert a `pipeline_step_runs` row
 *   - `recordStepFinish`     update with status + timings + token use
 *
 * Usage note: the orchestrator's `jobId` and step identity are the
 * natural correlation keys. `pipeline_jobs.jobId` is unique so a retry
 * that reuses the same jobId updates-rather-than-duplicates.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineJobs, pipelineStepRuns } from "@/lib/db/schema";
import { costMicroUsd } from "@/lib/ai/pricing";

export interface JobStart {
  jobId: string;
  projectId: string;
  startedAt: Date;
}

export interface JobFinish {
  jobId: string;
  status: "completed" | "failed";
  completedAt: Date;
  error?: string | null;
}

export interface StepStart {
  jobId: string;
  stepName: string;
  startedAt: Date;
}

export interface StepFinish {
  jobId: string;
  stepName: string;
  status: "completed" | "failed" | "skipped";
  completedAt: Date;
  error?: string | null;
  /** Model used for this step's LLM call, if any. */
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

/**
 * Insert a new job row. Idempotent against retry: if a row already
 * exists for this jobId we leave it alone.
 */
export async function recordJobStart(input: JobStart): Promise<void> {
  try {
    await db
      .insert(pipelineJobs)
      .values({
        jobId: input.jobId,
        projectId: input.projectId,
        status: "running",
        startedAt: input.startedAt,
      })
      // The unique index on jobId means a retry would throw — swallow.
      .onConflictDoNothing({ target: pipelineJobs.jobId });
  } catch {
    // Non-fatal.
  }
}

export async function recordJobFinish(input: JobFinish): Promise<void> {
  try {
    await db
      .update(pipelineJobs)
      .set({
        status: input.status,
        completedAt: input.completedAt,
        error: input.error ?? null,
      })
      .where(eq(pipelineJobs.jobId, input.jobId));
  } catch {
    // Non-fatal.
  }
}

// ─── Steps ──────────────────────────────────────────────────────────────────

export async function recordStepStart(input: StepStart): Promise<void> {
  try {
    await db.insert(pipelineStepRuns).values({
      jobId: input.jobId,
      stepName: input.stepName,
      status: "running",
      startedAt: input.startedAt,
    });
  } catch {
    // Non-fatal.
  }
}

/**
 * Update the most-recent `running` row for this (jobId, stepName) pair
 * to its terminal status. We match on status=running so retry loops
 * that restart a step add a NEW row rather than overwriting history.
 */
export async function recordStepFinish(input: StepFinish): Promise<void> {
  const cost = costMicroUsd(
    input.model ?? null,
    input.inputTokens ?? 0,
    input.outputTokens ?? 0
  );
  try {
    await db
      .update(pipelineStepRuns)
      .set({
        status: input.status,
        completedAt: input.completedAt,
        error: input.error ?? null,
        modelUsed: input.model ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        costUsdMicros: cost > 0 ? cost : null,
      })
      .where(
        and(
          eq(pipelineStepRuns.jobId, input.jobId),
          eq(pipelineStepRuns.stepName, input.stepName),
          eq(pipelineStepRuns.status, "running")
        )
      );
  } catch {
    // Non-fatal.
  }
}
