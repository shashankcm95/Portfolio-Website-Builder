import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  repoSources,
  facts as factsTable,
  derivedFacts as derivedFactsTable,
  generatedSections,
  claimMap,
  users,
  portfolios,
} from "@/lib/db/schema";
import { enqueueJob, updateJob } from "@/lib/pipeline/queue";
import { parseResume } from "@/lib/pipeline/steps/resume-parse";
import { structureResume } from "@/lib/pipeline/steps/resume-structure";
import {
  generateContextPack,
  type ContextGenerateInput,
} from "@/lib/pipeline/steps/context-generate";
import { extractFacts } from "@/lib/pipeline/steps/fact-extract";
import { generateNarratives } from "@/lib/pipeline/steps/narrative-generate";
import { verifyClaims } from "@/lib/pipeline/steps/claim-verify";
import type { ContextPack } from "@/lib/ai/schemas/context-pack";
import type { Fact, FactExtractionResult } from "@/lib/ai/schemas/facts";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StepName =
  | "resume_parse"
  | "resume_structure"
  | "repo_fetch"
  | "context_generate"
  | "fact_extract"
  | "narrative_generate"
  | "claim_verify";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PipelineStep {
  name: StepName;
  status: StepStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface PipelineState {
  projectId: string;
  jobId: string;
  currentStep: StepName | null;
  steps: PipelineStep[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STEP_ORDER: StepName[] = [
  "resume_parse",
  "resume_structure",
  "repo_fetch",
  "context_generate",
  "fact_extract",
  "narrative_generate",
  "claim_verify",
];

// ─── In-memory state tracking ───────────────────────────────────────────────

const pipelineStates = new Map<string, PipelineState>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts the full pipeline for a project.
 * Returns the job ID for status tracking.
 *
 * The pipeline runs asynchronously and updates state in-memory
 * and project status in the database.
 */
export function startPipeline(
  projectId: string,
  options?: {
    resumeBuffer?: Buffer;
    resumeMimeType?: string;
    fileTree?: string;
    dependenciesRaw?: string;
    dependenciesParsed?: Record<string, string>;
    readme?: string;
  }
): string {
  const jobId = enqueueJob(projectId);

  const state: PipelineState = {
    projectId,
    jobId,
    currentStep: null,
    steps: STEP_ORDER.map((name) => ({ name, status: "pending" as StepStatus })),
    startedAt: new Date(),
  };

  pipelineStates.set(projectId, state);

  // Run pipeline asynchronously (fire-and-forget)
  runPipeline(projectId, jobId, options).catch((error) => {
    console.error(`[orchestrator] Pipeline failed for project ${projectId}:`, error);
  });

  return jobId;
}

/**
 * Returns the current pipeline state for a project.
 */
export function getStatus(projectId: string): PipelineState | undefined {
  return pipelineStates.get(projectId);
}

/**
 * Cancels a running pipeline for a project.
 */
export function cancelPipeline(projectId: string): boolean {
  const state = pipelineStates.get(projectId);
  if (!state) return false;

  state.error = "Cancelled by user";
  state.completedAt = new Date();

  // Mark current running step as failed
  const runningStep = state.steps.find((s) => s.status === "running");
  if (runningStep) {
    runningStep.status = "failed";
    runningStep.error = "Cancelled by user";
    runningStep.completedAt = new Date();
  }

  // Mark remaining pending steps as skipped
  for (const step of state.steps) {
    if (step.status === "pending") {
      step.status = "skipped";
    }
  }

  updateJob(state.jobId, { status: "failed", error: "Cancelled by user", completedAt: new Date() });

  // Update DB
  updateProjectStatus(projectId, "cancelled", "Cancelled by user").catch(console.error);

  return true;
}

// ─── Pipeline Runner ────────────────────────────────────────────────────────

async function runPipeline(
  projectId: string,
  jobId: string,
  options?: {
    resumeBuffer?: Buffer;
    resumeMimeType?: string;
    fileTree?: string;
    dependenciesRaw?: string;
    dependenciesParsed?: Record<string, string>;
    readme?: string;
  }
): Promise<void> {
  const state = pipelineStates.get(projectId);
  if (!state) return;

  updateJob(jobId, { status: "running", startedAt: new Date() });
  await updateProjectStatus(projectId, "running");

  // Shared context between steps
  let rawResumeText: string | undefined;
  let contextPack: ContextPack | undefined;
  let extractedFacts: Fact[] = [];
  let factExtractionResult: FactExtractionResult | undefined;

  for (const stepDef of state.steps) {
    // Check if pipeline was cancelled
    if (state.error === "Cancelled by user") {
      return;
    }

    const stepName = stepDef.name;

    try {
      // Mark step as running
      stepDef.status = "running";
      stepDef.startedAt = new Date();
      state.currentStep = stepName;

      await updateProjectStatus(projectId, `running:${stepName}`);

      // Execute the step
      switch (stepName) {
        case "resume_parse": {
          if (options?.resumeBuffer && options?.resumeMimeType) {
            const result = await parseResume(
              options.resumeBuffer,
              options.resumeMimeType
            );
            rawResumeText = result.rawText;

            // Store raw text in user record (via project -> portfolio -> user)
            await storeResumeRawText(projectId, rawResumeText);
          } else {
            // Try to get resume text from user record
            rawResumeText = await getResumeRawText(projectId);
            if (!rawResumeText) {
              stepDef.status = "skipped";
              stepDef.completedAt = new Date();
              continue;
            }
          }
          break;
        }

        case "resume_structure": {
          if (rawResumeText) {
            const structured = await structureResume(rawResumeText);

            // Store structured resume in user record
            await storeResumeJson(projectId, structured);
          } else {
            stepDef.status = "skipped";
            stepDef.completedAt = new Date();
            continue;
          }
          break;
        }

        case "repo_fetch": {
          // Repo fetch is handled externally (GitHub API integration)
          // This step checks if repo data is available or provided
          if (
            !options?.fileTree &&
            !options?.readme &&
            !options?.dependenciesRaw
          ) {
            // Check if repo sources already exist in DB
            const existingSources = await db
              .select()
              .from(repoSources)
              .where(eq(repoSources.projectId, projectId));

            if (existingSources.length === 0) {
              stepDef.status = "skipped";
              stepDef.completedAt = new Date();
              console.warn(
                `[orchestrator] No repo data available for project ${projectId}. Skipping repo_fetch.`
              );
              continue;
            }
          } else {
            // Store provided repo data
            if (options?.readme) {
              await db.insert(repoSources).values({
                projectId,
                sourceType: "readme",
                content: options.readme,
              });
            }
            if (options?.dependenciesRaw) {
              await db.insert(repoSources).values({
                projectId,
                sourceType: "dependencies",
                content: options.dependenciesRaw,
              });
            }
            if (options?.fileTree) {
              await db.insert(repoSources).values({
                projectId,
                sourceType: "file_tree",
                content: options.fileTree,
              });
            }
          }
          break;
        }

        case "context_generate": {
          const fileTree = options?.fileTree ?? (await getRepoSource(projectId, "file_tree")) ?? "";
          const readme = options?.readme ?? (await getRepoSource(projectId, "readme")) ?? "";
          const depsRaw =
            options?.dependenciesRaw ??
            (await getRepoSource(projectId, "dependencies")) ??
            "";

          const input: ContextGenerateInput = {
            fileTree,
            dependenciesRaw: depsRaw,
            dependenciesParsed: options?.dependenciesParsed,
            readme,
          };

          contextPack = await generateContextPack(input);

          // Store context pack as a repo source
          await db.insert(repoSources).values({
            projectId,
            sourceType: "context_pack",
            content: JSON.stringify(contextPack),
          });

          break;
        }

        case "fact_extract": {
          if (!contextPack) {
            // Try to load from DB
            const contextPackSource = await getRepoSource(projectId, "context_pack");
            if (contextPackSource) {
              contextPack = JSON.parse(contextPackSource);
            } else {
              throw new Error("No context pack available. Run context_generate first.");
            }
          }

          const readme = options?.readme ?? (await getRepoSource(projectId, "readme")) ?? "";
          const depsRaw =
            options?.dependenciesRaw ??
            (await getRepoSource(projectId, "dependencies")) ??
            "";

          factExtractionResult = await extractFacts({
            contextPack: contextPack!,
            readme,
            dependencies: depsRaw,
            resumeContext: rawResumeText,
          });

          extractedFacts = factExtractionResult.facts;

          // Store facts in DB
          for (const fact of factExtractionResult.facts) {
            await db.insert(factsTable).values({
              projectId,
              claim: fact.claim,
              category: fact.category,
              confidence: fact.confidence,
              evidenceType: fact.evidenceType,
              evidenceRef: fact.evidenceRef,
              evidenceText: fact.evidenceText,
            });
          }

          // Store derived facts in DB
          for (const derived of factExtractionResult.derivedFacts) {
            await db.insert(derivedFactsTable).values({
              projectId,
              claim: derived.claim,
              derivationRule: derived.derivationRule,
              sourceFactIds: JSON.stringify(derived.sourceFactClaims),
              confidence: derived.confidence,
            });
          }

          break;
        }

        case "narrative_generate": {
          if (extractedFacts.length === 0) {
            // Try to load facts from DB
            const dbFacts = await db
              .select()
              .from(factsTable)
              .where(eq(factsTable.projectId, projectId));

            if (dbFacts.length === 0) {
              throw new Error("No facts available. Run fact_extract first.");
            }

            extractedFacts = dbFacts.map((f) => ({
              claim: f.claim,
              category: f.category as Fact["category"],
              confidence: f.confidence,
              evidenceType: f.evidenceType as Fact["evidenceType"],
              evidenceRef: f.evidenceRef ?? "",
              evidenceText: f.evidenceText ?? "",
            }));
          }

          if (!contextPack) {
            const contextPackSource = await getRepoSource(projectId, "context_pack");
            if (contextPackSource) {
              contextPack = JSON.parse(contextPackSource);
            }
          }

          // Get project name
          const project = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

          const projectName = project[0]?.displayName ?? project[0]?.repoName ?? "Unknown Project";

          const narratives = await generateNarratives({
            projectName,
            facts: extractedFacts,
            contextPack: contextPack!,
          });

          // Store generated sections in DB
          for (const section of narratives.sections) {
            await db.insert(generatedSections).values({
              projectId,
              sectionType: section.sectionType,
              variant: section.variant,
              content: section.content,
              modelUsed: "claude-sonnet-4-5-20250514",
            });
          }

          break;
        }

        case "claim_verify": {
          // Load generated sections from DB
          const sections = await db
            .select()
            .from(generatedSections)
            .where(eq(generatedSections.projectId, projectId));

          if (sections.length === 0) {
            throw new Error(
              "No generated sections available. Run narrative_generate first."
            );
          }

          if (extractedFacts.length === 0) {
            const dbFacts = await db
              .select()
              .from(factsTable)
              .where(eq(factsTable.projectId, projectId));

            extractedFacts = dbFacts.map((f) => ({
              claim: f.claim,
              category: f.category as Fact["category"],
              confidence: f.confidence,
              evidenceType: f.evidenceType as Fact["evidenceType"],
              evidenceRef: f.evidenceRef ?? "",
              evidenceText: f.evidenceText ?? "",
            }));
          }

          // Verify each section
          for (const section of sections) {
            const verificationResult = await verifyClaims({
              generatedText: section.content,
              facts: extractedFacts,
              sectionType: section.sectionType,
              variant: section.variant,
            });

            // Store claim map entries
            for (const claim of verificationResult.claims) {
              await db.insert(claimMap).values({
                sectionId: section.id,
                sentenceIndex: claim.sentenceIndex,
                sentenceText: claim.sentenceText,
                factIds: JSON.stringify(claim.factIds),
                verification: claim.verification,
                confidence: claim.confidence,
              });
            }
          }

          break;
        }
      }

      // Mark step as completed
      stepDef.status = "completed";
      stepDef.completedAt = new Date();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      stepDef.status = "failed";
      stepDef.error = errorMessage;
      stepDef.completedAt = new Date();

      state.error = `Step "${stepName}" failed: ${errorMessage}`;
      state.completedAt = new Date();

      updateJob(jobId, {
        status: "failed",
        error: state.error,
        completedAt: new Date(),
      });

      await updateProjectStatus(projectId, "failed", state.error);

      console.error(
        `[orchestrator] Step "${stepName}" failed for project ${projectId}:`,
        errorMessage
      );
      return;
    }
  }

  // All steps completed successfully
  state.currentStep = null;
  state.completedAt = new Date();

  updateJob(jobId, { status: "completed", completedAt: new Date() });
  await updateProjectStatus(projectId, "completed");

  // Update lastAnalyzed
  await db
    .update(projects)
    .set({ lastAnalyzed: new Date() })
    .where(eq(projects.id, projectId));
}

// ─── Helper Functions ───────────────────────────────────────────────────────

async function updateProjectStatus(
  projectId: string,
  status: string,
  error?: string
): Promise<void> {
  try {
    await db
      .update(projects)
      .set({
        pipelineStatus: status,
        pipelineError: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  } catch (err) {
    console.error("[orchestrator] Failed to update project status:", err);
  }
}

async function getRepoSource(
  projectId: string,
  sourceType: string
): Promise<string | null> {
  const result = await db
    .select()
    .from(repoSources)
    .where(eq(repoSources.projectId, projectId))
    .limit(10);

  const source = result.find((r) => r.sourceType === sourceType);
  return source?.content ?? null;
}

async function storeResumeRawText(
  projectId: string,
  rawText: string
): Promise<void> {
  try {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project[0]) return;

    const portfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, project[0].portfolioId))
      .limit(1);

    if (!portfolio[0]) return;

    await db
      .update(users)
      .set({ resumeRawText: rawText, updatedAt: new Date() })
      .where(eq(users.id, portfolio[0].userId));
  } catch (err) {
    console.error("[orchestrator] Failed to store resume raw text:", err);
  }
}

async function getResumeRawText(projectId: string): Promise<string | undefined> {
  try {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project[0]) return undefined;

    const portfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, project[0].portfolioId))
      .limit(1);

    if (!portfolio[0]) return undefined;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, portfolio[0].userId))
      .limit(1);

    return user[0]?.resumeRawText ?? undefined;
  } catch (err) {
    console.error("[orchestrator] Failed to get resume raw text:", err);
    return undefined;
  }
}

async function storeResumeJson(
  projectId: string,
  resumeJson: unknown
): Promise<void> {
  try {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project[0]) return;

    const portfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, project[0].portfolioId))
      .limit(1);

    if (!portfolio[0]) return;

    await db
      .update(users)
      .set({ resumeJson, updatedAt: new Date() })
      .where(eq(users.id, portfolio[0].userId));
  } catch (err) {
    console.error("[orchestrator] Failed to store resume JSON:", err);
  }
}
