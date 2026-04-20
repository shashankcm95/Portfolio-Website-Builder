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
import { runStoryboardGenerate } from "@/lib/pipeline/steps/storyboard-generate";
import { runEmbeddingGenerate } from "@/lib/pipeline/steps/embedding-generate";
import {
  recordJobStart,
  recordJobFinish,
  recordStepStart,
  recordStepFinish,
} from "@/lib/pipeline/history";
import { getLlmClientForProject } from "@/lib/ai/providers/factory";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
  type LlmClient,
} from "@/lib/ai/providers/types";
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
  | "claim_verify"
  | "storyboard_generate"
  | "embedding_generate";

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
  "storyboard_generate",
  "embedding_generate",
];

/**
 * Steps that must NOT fail the overall pipeline. If one of these throws,
 * we mark it failed and continue with subsequent steps. The rationale is
 * that the storyboard + embedding pass are auxiliary enrichments —
 * narratives + facts + credibility signals still render without them.
 * Embedding failure just means the chatbot has an empty corpus for this
 * project; the published site renders normally.
 */
const NON_FATAL_STEPS: ReadonlySet<StepName> = new Set([
  "storyboard_generate",
  "embedding_generate",
]);

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

  // Phase 6 — durable job history. Non-fatal if the DB write fails.
  recordJobStart({
    jobId,
    projectId,
    startedAt: state.startedAt,
  });

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

  // Phase 3.5: resolve the LLM client once per pipeline run. The factory
  // reads the project → portfolio → user traversal, then applies the
  // BYOK → platform-env fallback chain. If nothing is configured, we
  // fail-fast with a structured `pipelineError` prefix the UI recognizes.
  let llm: LlmClient;
  try {
    llm = await getLlmClientForProject(projectId);
  } catch (e) {
    const isTyped =
      e instanceof LlmNotConfiguredError || e instanceof LlmInvalidKeyError;
    const pipelineError = isTyped
      ? e instanceof LlmNotConfiguredError
        ? "llm_not_configured"
        : `llm_invalid_key:${(e as LlmInvalidKeyError).provider}`
      : `pipeline_init_failed: ${e instanceof Error ? e.message : String(e)}`;

    state.error = pipelineError;
    state.completedAt = new Date();
    for (const s of state.steps) {
      if (s.status === "pending") s.status = "skipped";
    }
    updateJob(jobId, {
      status: "failed",
      error: pipelineError,
      completedAt: new Date(),
    });
    // Phase 6 — persist the job-level failure before early-return.
    recordJobFinish({
      jobId,
      status: "failed",
      completedAt: new Date(),
      error: pipelineError,
    });
    await updateProjectStatus(projectId, "failed", pipelineError);
    return;
  }

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

      // Phase 6 — durable step history.
      recordStepStart({ jobId, stepName, startedAt: stepDef.startedAt });

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
              recordStepFinish({
                jobId,
                stepName,
                status: "skipped",
                completedAt: stepDef.completedAt,
              });
              continue;
            }
          }
          break;
        }

        case "resume_structure": {
          if (rawResumeText) {
            const structured = await structureResume(rawResumeText, llm);

            // Store structured resume in user record
            await storeResumeJson(projectId, structured);
          } else {
            stepDef.status = "skipped";
            stepDef.completedAt = new Date();
            recordStepFinish({
              jobId,
              stepName,
              status: "skipped",
              completedAt: stepDef.completedAt,
            });
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
              recordStepFinish({
                jobId,
                stepName,
                status: "skipped",
                completedAt: stepDef.completedAt,
              });
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

          contextPack = await generateContextPack(input, llm);

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
              try {
                contextPack = JSON.parse(contextPackSource);
              } catch {
                throw new Error("Context pack data is corrupt. Re-run context_generate.");
              }
            } else {
              throw new Error("No context pack available. Run context_generate first.");
            }
          }

          if (!contextPack) {
            throw new Error("No context pack available for fact extraction.");
          }

          const readme = options?.readme ?? (await getRepoSource(projectId, "readme")) ?? "";
          const depsRaw =
            options?.dependenciesRaw ??
            (await getRepoSource(projectId, "dependencies")) ??
            "";

          factExtractionResult = await extractFacts(
            {
              contextPack,
              readme,
              dependencies: depsRaw,
              resumeContext: rawResumeText,
            },
            llm
          );

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
              try {
                contextPack = JSON.parse(contextPackSource);
              } catch {
                throw new Error("Context pack data is corrupt. Re-run context_generate.");
              }
            }
          }

          if (!contextPack) {
            throw new Error("No context pack available for narrative generation.");
          }

          // Get project name
          const project = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

          const projectName = project[0]?.displayName ?? project[0]?.repoName ?? "Unknown Project";

          const narratives = await generateNarratives(
            {
              projectName,
              facts: extractedFacts,
              contextPack,
            },
            llm
          );

          // Store generated sections in DB (upsert so retries are idempotent)
          for (const section of narratives.sections) {
            await db
              .insert(generatedSections)
              .values({
                projectId,
                sectionType: section.sectionType,
                variant: section.variant,
                content: section.content,
                modelUsed: "gpt-4o-mini",
              })
              .onConflictDoUpdate({
                target: [
                  generatedSections.projectId,
                  generatedSections.sectionType,
                  generatedSections.variant,
                  generatedSections.version,
                ],
                set: {
                  content: section.content,
                  modelUsed: "gpt-4o-mini",
                  updatedAt: new Date(),
                },
              });
          }

          break;
        }

        case "storyboard_generate": {
          const result = await runStoryboardGenerate(projectId, llm);
          if (!result.ok) {
            throw new Error(result.error);
          }
          break;
        }

        case "embedding_generate": {
          // Phase 5 — populate the chatbot's retrieval corpus. Non-fatal:
          // if this fails, the rest of the pipeline still completes; the
          // published site's chatbot will simply have no context until the
          // next successful run.
          const result = await runEmbeddingGenerate(projectId);
          if (!result.ok) {
            throw new Error(result.error ?? "embedding_generate failed");
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
            const verificationResult = await verifyClaims(
              {
                generatedText: section.content,
                facts: extractedFacts,
                sectionType: section.sectionType,
                variant: section.variant,
              },
              llm
            );

            // Clear stale claim-map rows for this section before re-inserting
            await db
              .delete(claimMap)
              .where(eq(claimMap.sectionId, section.id));

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

      // Phase 6 — persist the step's final state. Model + tokens are
      // null for v1: internal step callers still use the legacy `text`
      // / `structured` methods. Upgrading them to `measuredText` /
      // `measuredStructured` is tracked in 6.1 and lights up cost
      // attribution per step.
      //
      // Note: steps that `continue`d (status === "skipped") emit their
      // own recordStepFinish inline before the continue, so this line
      // only covers the happy "completed" path.
      recordStepFinish({
        jobId,
        stepName,
        status: "completed",
        completedAt: stepDef.completedAt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      stepDef.status = "failed";
      stepDef.error = errorMessage;
      stepDef.completedAt = new Date();

      console.error(
        `[orchestrator] Step "${stepName}" failed for project ${projectId}:`,
        errorMessage
      );

      recordStepFinish({
        jobId,
        stepName,
        status: "failed",
        completedAt: stepDef.completedAt,
        error: errorMessage,
      });

      // Non-fatal step: log and continue. Other artifacts still ship.
      if (NON_FATAL_STEPS.has(stepName)) {
        continue;
      }

      state.error = `Step "${stepName}" failed: ${errorMessage}`;
      state.completedAt = new Date();

      updateJob(jobId, {
        status: "failed",
        error: state.error,
        completedAt: new Date(),
      });

      // Phase 6 — durable job-fail history.
      recordJobFinish({
        jobId,
        status: "failed",
        completedAt: state.completedAt,
        error: state.error,
      });

      await updateProjectStatus(projectId, "failed", state.error);

      return;
    }
  }

  // All steps completed successfully
  state.currentStep = null;
  state.completedAt = new Date();

  updateJob(jobId, { status: "completed", completedAt: new Date() });
  // Phase 6 — durable job-complete history.
  recordJobFinish({
    jobId,
    status: "completed",
    completedAt: state.completedAt,
  });

  await updateProjectStatus(projectId, "completed");

  // Update lastAnalyzed
  await db
    .update(projects)
    .set({ lastAnalyzed: new Date() })
    .where(eq(projects.id, projectId));
}

/**
 * Regenerate a single narrative section using cached facts + contextPack.
 *
 * Skips the expensive earlier pipeline steps (repo_fetch, context_generate,
 * fact_extract) and re-runs just `narrative_generate` + `claim_verify` for
 * the one (sectionType, variant) the user wants to redo.
 *
 * Note: the underlying LLM call still returns all 10 sections — this helper
 * picks the one the caller asked for and upserts only that row, then
 * re-verifies claims for that section.
 *
 * Throws if prerequisites are missing (facts / context pack not yet built).
 */
export async function regenerateSection(
  projectId: string,
  sectionType: string,
  variant: string
): Promise<{ sectionId: string }> {
  // Phase 3.5: resolve the LLM client once via the user bound to the project.
  // Typed errors bubble up; API route turns them into 409s.
  const llm = await getLlmClientForProject(projectId);

  // Load cached contextPack
  const contextPackRaw = await getRepoSource(projectId, "context_pack");
  if (!contextPackRaw) {
    throw new Error(
      "Context pack not found. Run the full analysis pipeline first."
    );
  }
  let contextPack: ContextPack;
  try {
    contextPack = JSON.parse(contextPackRaw);
  } catch {
    throw new Error("Context pack data is corrupt. Re-run analysis.");
  }

  // Load facts
  const dbFacts = await db
    .select()
    .from(factsTable)
    .where(eq(factsTable.projectId, projectId));

  if (dbFacts.length === 0) {
    throw new Error(
      "No facts found for this project. Run the full analysis pipeline first."
    );
  }

  const facts: Fact[] = dbFacts.map((f) => ({
    claim: f.claim,
    category: f.category as Fact["category"],
    confidence: f.confidence,
    evidenceType: f.evidenceType as Fact["evidenceType"],
    evidenceRef: f.evidenceRef ?? "",
    evidenceText: f.evidenceText ?? "",
  }));

  // Resolve project name
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const projectName =
    project?.displayName ?? project?.repoName ?? "Unknown Project";

  // Generate narratives (returns all 10 — we pick the one requested)
  const narratives = await generateNarratives(
    {
      projectName,
      facts,
      contextPack,
    },
    llm
  );

  const picked = narratives.sections.find(
    (s) => s.sectionType === sectionType && s.variant === variant
  );
  if (!picked) {
    throw new Error(
      `Model did not return a section for ${sectionType}/${variant}. Try again.`
    );
  }

  // Upsert the single section
  const [upserted] = await db
    .insert(generatedSections)
    .values({
      projectId,
      sectionType: picked.sectionType,
      variant: picked.variant,
      content: picked.content,
      modelUsed: "gpt-4o-mini",
    })
    .onConflictDoUpdate({
      target: [
        generatedSections.projectId,
        generatedSections.sectionType,
        generatedSections.variant,
        generatedSections.version,
      ],
      set: {
        content: picked.content,
        isUserEdited: false,
        userContent: null,
        modelUsed: "gpt-4o-mini",
        updatedAt: new Date(),
      },
    })
    .returning();

  // Re-verify claims for this section only
  const verificationResult = await verifyClaims(
    {
      generatedText: picked.content,
      facts,
      sectionType: picked.sectionType,
      variant: picked.variant,
    },
    llm
  );

  await db.delete(claimMap).where(eq(claimMap.sectionId, upserted.id));

  for (const claim of verificationResult.claims) {
    await db.insert(claimMap).values({
      sectionId: upserted.id,
      sentenceIndex: claim.sentenceIndex,
      sentenceText: claim.sentenceText,
      factIds: JSON.stringify(claim.factIds),
      verification: claim.verification,
      confidence: claim.confidence,
    });
  }

  return { sectionId: upserted.id };
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
