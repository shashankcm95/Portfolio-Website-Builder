import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generatedSections, projects, repoSources } from "@/lib/db/schema";
import type { LlmClient } from "@/lib/ai/providers/types";
import { getLlmClientForProject } from "@/lib/ai/providers/factory";
import {
  storyboardPayloadSchema,
  STORYBOARD_JSON_SCHEMA,
  type StoryboardCard,
  type StoryboardPayload,
  type VerifiedClaim,
} from "@/lib/ai/schemas/storyboard";
import { buildStoryboardPrompt } from "@/lib/ai/prompts/storyboard-generation";
import { buildVerifierContext } from "@/lib/pipeline/verifier/context";
import { verifyClaim } from "@/lib/pipeline/verifier";
import { curateFileTree } from "@/lib/pipeline/steps/file-tree-curation";
import type { ContextPack } from "@/lib/ai/schemas/context-pack";
import type {
  CredibilitySignals,
  StoredCredibilitySignals,
} from "@/lib/credibility/types";
import { throwIfAborted, PipelineAbortError } from "@/lib/pipeline/abort";

const MAX_CLAIMS_PER_CARD = 3;
const MAX_DEP_NAMES = 100;

/**
 * Run the Phase 3 storyboard-generate step for a single project.
 *
 * Non-fatal by construction: every error path returns a structured result
 * rather than throwing, so the orchestrator can mark the step `failed`
 * without cascading to the overall pipeline. The detail page continues to
 * render the narrative/facts/credibility artifacts even if this fails.
 */
export type StoryboardGenerateResult =
  | { ok: true; payload: StoryboardPayload }
  | { ok: false; error: string };

export async function runStoryboardGenerate(
  projectId: string,
  /**
   * Optional pre-resolved LlmClient. When omitted (e.g. from the
   * regenerate API route), we resolve via the project-based factory.
   * The orchestrator passes an already-resolved instance to avoid
   * refetching the user row for every pipeline step.
   */
  llmClient?: LlmClient,
  signal?: AbortSignal
): Promise<StoryboardGenerateResult> {
  try {
    throwIfAborted(signal);
    const llm = llmClient ?? (await getLlmClientForProject(projectId));

    // ─── Load inputs (one round-trip each via Promise.all) ───
    const [projectRow, sources] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
      db.select().from(repoSources).where(eq(repoSources.projectId, projectId)),
    ]);

    const project = projectRow[0];
    if (!project) {
      return { ok: false, error: "Project not found" };
    }

    const contextPackRaw = sources.find(
      (s) => s.sourceType === "context_pack"
    );
    if (!contextPackRaw || !contextPackRaw.content) {
      return {
        ok: false,
        error: "No context pack available. Run context_generate first.",
      };
    }

    let contextPack: ContextPack;
    try {
      contextPack = JSON.parse(contextPackRaw.content) as ContextPack;
    } catch {
      return { ok: false, error: "Context pack data is corrupt" };
    }

    const readme =
      sources.find((s) => s.sourceType === "readme")?.content ?? "";
    const fileTreeBlob =
      sources.find((s) => s.sourceType === "file_tree")?.content ?? "";

    // ─── Build verifier context + inputs for the prompt ───
    const ctx = await buildVerifierContext(projectId);
    const curatedTree = curateFileTree(ctx.fileTreePaths);
    const dependencyNames = dedupe(ctx.depsParsed.map((d) => d.name)).slice(
      0,
      MAX_DEP_NAMES
    );

    const credSignals = (project.credibilitySignals ?? null) as
      | CredibilitySignals
      | StoredCredibilitySignals
      | null;

    const repoMetadata = (project.repoMetadata ?? {}) as {
      homepage?: string | null;
      htmlUrl?: string;
    };
    const homepage = repoMetadata.homepage ?? null;
    const cloneUrl = project.repoUrl ?? repoMetadata.htmlUrl ?? "";

    const projectName =
      project.displayName ?? project.repoName ?? "This project";

    // ─── Call the model with strict JSON schema ───
    const { systemPrompt, userPrompt } = buildStoryboardPrompt({
      projectName,
      contextPack,
      curatedFileTree: curatedTree,
      dependencyNames,
      readmeExcerpt: readme,
      homepage,
      credibilitySignals: credSignals,
      cloneUrl,
    });

    let raw: unknown;
    try {
      raw = await llm.structured<unknown>({
        systemPrompt,
        userPrompt,
        maxTokens: 4096,
        jsonSchema: {
          name: STORYBOARD_JSON_SCHEMA.name,
          schema: STORYBOARD_JSON_SCHEMA.schema as Record<string, unknown>,
        },
      });
    } catch (e) {
      return {
        ok: false,
        error: `LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Mermaid disclaimer is mainly unused here but we silence unused
    void fileTreeBlob;

    // ─── Parse + validate the payload ───
    const parsed = storyboardPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: `LLM returned malformed storyboard: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .slice(0, 3)
          .join("; ")}`,
      };
    }

    // ─── Run the verifier over every claim, drop the unverified ───
    const verifiedPayload: StoryboardPayload = {
      ...parsed.data,
      cards: parsed.data.cards.map((card) =>
        verifyAndFilterCard(card, ctx)
      ),
    };

    // ─── Persist (upsert on unique (projectId, sectionType, variant, version)) ───
    await db
      .insert(generatedSections)
      .values({
        projectId,
        sectionType: "storyboard",
        variant: "default",
        content: JSON.stringify(verifiedPayload),
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
          content: JSON.stringify(verifiedPayload),
          modelUsed: "gpt-4o-mini",
          updatedAt: new Date(),
        },
      });

    return { ok: true, payload: verifiedPayload };
  } catch (e) {
    // Phase 10 — re-throw cancellation so the orchestrator handles it
    // as an abort instead of a non-fatal step failure.
    if (e instanceof PipelineAbortError) throw e;
    return {
      ok: false,
      error: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply the verifier to each claim on a card:
 *   - Zod already enforced `verifier` presence, so we never drop on schema.
 *   - Stamp `status` + `evidence` from the verifier result.
 *   - Cap to MAX_CLAIMS_PER_CARD.
 *   - Minimum-1 floor: if no claims survive at all (impossible with required
 *     verifier, but future-proof) we leave the array empty and let the UI
 *     render a neutral placeholder.
 */
function verifyAndFilterCard(
  card: StoryboardCard,
  ctx: Parameters<typeof verifyClaim>[1]
): StoryboardCard {
  const processed: VerifiedClaim[] = card.claims
    .slice(0, MAX_CLAIMS_PER_CARD)
    .map((claim) => {
      const result = verifyClaim(claim.verifier, ctx);
      return {
        label: claim.label,
        verifier: claim.verifier,
        status: result.status,
        evidence: result.evidence,
      };
    });
  return { ...card, claims: processed };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Load the persisted storyboard payload for a project, if any.
 * Returns `null` when no row exists (pre-Phase-3 project or step hasn't
 * run yet).
 */
export async function loadStoryboard(
  projectId: string
): Promise<{
  payload: StoryboardPayload;
  isUserEdited: boolean;
  updatedAt: Date | null;
} | null> {
  const [row] = await db
    .select()
    .from(generatedSections)
    .where(
      and(
        eq(generatedSections.projectId, projectId),
        eq(generatedSections.sectionType, "storyboard"),
        eq(generatedSections.variant, "default")
      )
    )
    .limit(1);

  if (!row) return null;

  // User-edited content takes precedence
  const raw = row.isUserEdited && row.userContent ? row.userContent : row.content;
  try {
    const parsed = storyboardPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return {
      payload: parsed.data,
      isUserEdited: row.isUserEdited ?? false,
      updatedAt: row.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}
