/**
 * Phase 5 — Pipeline step: regenerate embeddings for a single project.
 *
 * Runs after narrative synthesis + claim verification so the chunks
 * reflect the latest committed content. Idempotent: deletes all prior
 * `embeddings` rows for this project before inserting.
 *
 * Profile chunk: each project carries a copy of the portfolio-wide
 * profile chunk (owner name + bio + top skills). Slight redundancy
 * (N projects = N copies) but keeps the step self-contained — a
 * per-project re-run doesn't need to coordinate with a separate
 * portfolio-wide step. At ~50-200 chunks per portfolio this costs
 * nothing material.
 *
 * Embedding provider: the platform OpenAI key via `generateEmbeddingsBatch`.
 * BYOK embeddings are deferred to Phase 6+. Missing key → step throws
 * and the orchestrator marks this step non-fatal.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  derivedFacts as derivedFactsTable,
  embeddings,
  facts as factsTable,
  generatedSections,
  portfolios,
  projects,
  users,
} from "@/lib/db/schema";
import { generateEmbeddingsBatch } from "@/lib/ai/openai";
import {
  buildChunks,
  type ChunkerDerivedFactRow,
  type ChunkerFactRow,
  type ChunkerProfileInput,
  type ChunkerProjectRow,
  type ChunkerSectionRow,
} from "@/lib/chatbot/chunker";
import { throwIfAborted, PipelineAbortError } from "@/lib/pipeline/abort";

export interface EmbeddingGenerateResult {
  ok: boolean;
  chunkCount: number;
  error?: string;
}

/**
 * Regenerate embeddings for `projectId`. Returns `{ok:false}` with an
 * error message on any failure — the orchestrator decides whether to
 * surface as fatal.
 */
export async function runEmbeddingGenerate(
  projectId: string,
  signal?: AbortSignal
): Promise<EmbeddingGenerateResult> {
  try {
    throwIfAborted(signal);
    // ── Load project + its portfolio + owner (for the profile chunk) ─────
    const [projectRow] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!projectRow) {
      return { ok: false, chunkCount: 0, error: "Project not found" };
    }

    const [portfolioRow] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, projectRow.portfolioId))
      .limit(1);

    if (!portfolioRow) {
      return { ok: false, chunkCount: 0, error: "Portfolio not found" };
    }

    const [ownerRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, portfolioRow.userId))
      .limit(1);

    // ── Load project content ─────────────────────────────────────────────
    const factRows = await db
      .select()
      .from(factsTable)
      .where(eq(factsTable.projectId, projectId));
    const derivedFactRows = await db
      .select()
      .from(derivedFactsTable)
      .where(eq(derivedFactsTable.projectId, projectId));
    const sectionRows = await db
      .select()
      .from(generatedSections)
      .where(eq(generatedSections.projectId, projectId));

    // ── Shape into chunker input ─────────────────────────────────────────
    const project: ChunkerProjectRow = {
      id: projectRow.id,
      name: projectName(projectRow),
      description: projectDescription(projectRow),
      stackSummary: summarizeStack(projectRow.techStack),
    };

    const factsByProject = new Map<string, ChunkerFactRow[]>();
    factsByProject.set(
      projectId,
      factRows.map((f) => ({
        id: f.id,
        projectId: f.projectId,
        category: f.category,
        claim: f.claim,
        evidenceText: f.evidenceText ?? null,
      }))
    );

    const derivedFactsByProject = new Map<string, ChunkerDerivedFactRow[]>();
    derivedFactsByProject.set(
      projectId,
      derivedFactRows.map((d) => ({
        id: d.id,
        projectId: d.projectId,
        claim: d.claim,
      }))
    );

    const sectionsByProject = new Map<string, ChunkerSectionRow[]>();
    sectionsByProject.set(
      projectId,
      sectionRows.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        sectionType: s.sectionType,
        content: s.content,
        userContent: s.userContent ?? null,
        isUserEdited: s.isUserEdited ?? false,
      }))
    );

    const profile: ChunkerProfileInput = buildProfileInput(
      portfolioRow,
      ownerRow
    );

    const chunks = buildChunks({
      profile,
      projects: [project],
      factsByProject,
      derivedFactsByProject,
      sectionsByProject,
    });

    if (chunks.length === 0) {
      // Delete prior rows to keep state consistent with zero-chunk input.
      await db.delete(embeddings).where(eq(embeddings.projectId, projectId));
      return { ok: true, chunkCount: 0 };
    }

    // ── Embed + persist (delete-then-insert for idempotency) ────────────
    const vectors = await generateEmbeddingsBatch(
      chunks.map((c) => c.chunkText)
    );
    if (vectors.length !== chunks.length) {
      return {
        ok: false,
        chunkCount: 0,
        error: `Embedding count mismatch: got ${vectors.length}, expected ${chunks.length}`,
      };
    }

    await db.transaction(async (tx) => {
      await tx.delete(embeddings).where(eq(embeddings.projectId, projectId));
      await tx.insert(embeddings).values(
        chunks.map((c, i) => ({
          projectId,
          chunkType: c.chunkType,
          chunkText: c.chunkText,
          sourceRef: c.sourceRef,
          embedding: JSON.stringify(vectors[i]),
          metadata: c.metadata,
        }))
      );
    });

    return { ok: true, chunkCount: chunks.length };
  } catch (err) {
    // Phase 10 — re-throw cancellation so the orchestrator treats it as
    // an abort rather than converting it into a non-fatal step failure.
    if (err instanceof PipelineAbortError) throw err;
    const message =
      err instanceof Error ? err.message : "Unknown embedding error";
    return { ok: false, chunkCount: 0, error: message };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Pick a display name: `displayName` → `repoName` → generic fallback. */
function projectName(row: typeof projects.$inferSelect): string {
  return (
    (row.displayName && row.displayName.trim()) ||
    (row.repoName && row.repoName.trim()) ||
    "Project"
  );
}

/**
 * Pick a project description. `manualDescription` wins (user-written),
 * then `repo_metadata.description` (fetched from GitHub).
 */
function projectDescription(
  row: typeof projects.$inferSelect
): string | null {
  const manual = row.manualDescription?.trim();
  if (manual) return manual;
  const meta = row.repoMetadata as Record<string, unknown> | null;
  const metaDesc = meta && typeof meta.description === "string" ? meta.description : null;
  return metaDesc?.trim() || null;
}

/**
 * Reduce a `projects.techStack` value (typically `string[]` or a JSON
 * array stored as jsonb) to a human-readable one-liner for the
 * project_summary chunk.
 */
function summarizeStack(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const clean = raw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    return clean.length > 0 ? clean.join(", ") : null;
  }
  if (typeof raw === "string") {
    return raw.trim() || null;
  }
  return null;
}

/**
 * Derive the profile chunk input from the portfolio row + owner user
 * row. We prefer (in order): stored `profileData.basics.summary` →
 * resume `summary` → empty. Skills come from `profileData.skills` if
 * present, else a best-effort pull from the resume JSON.
 */
function buildProfileInput(
  portfolioRow: typeof portfolios.$inferSelect,
  ownerRow: typeof users.$inferSelect | undefined
): ChunkerProfileInput {
  const pd =
    (portfolioRow.profileData as Record<string, unknown> | null) ?? {};
  const basics = (pd.basics as Record<string, unknown> | undefined) ?? {};
  const skills = Array.isArray(pd.skills)
    ? (pd.skills as Array<{ name?: unknown }>)
    : [];

  const ownerName =
    (typeof basics.name === "string" && basics.name.trim()) ||
    ownerRow?.name ||
    ownerRow?.githubUsername ||
    "Portfolio owner";

  const bio =
    (typeof basics.summary === "string" && basics.summary.trim()) || null;

  const topSkills = skills
    .map((s) => (typeof s.name === "string" ? s.name : ""))
    .filter((n) => n.length > 0)
    .slice(0, 12);

  return {
    portfolioId: portfolioRow.id,
    ownerName,
    bio,
    topSkills: topSkills.length > 0 ? topSkills : null,
  };
}
