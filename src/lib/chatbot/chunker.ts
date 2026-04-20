/**
 * Phase 5 — Turn a portfolio's structured data into retrieval-ready chunks.
 *
 * We keep this pure (no DB coupling): the caller loads rows and passes
 * them in. The pipeline step wraps this in `embedding-generate.ts`, and
 * tests pass in handcrafted rows.
 *
 * Chunking rules (plan §Chunking):
 *   - 1 chunk per `facts` row: "{category}: {claim}\nEvidence: {evidenceText}"
 *     (evidence truncated to FACT_EVIDENCE_TRUNCATE_CHARS)
 *   - 1 chunk per `derived_facts` row: the claim text
 *   - N chunks per `generated_sections` row — one per paragraph
 *     (split on blank lines; paragraphs > CHUNK_MAX_CHARS get further
 *     split on sentence boundaries)
 *   - 1 chunk per project: "Project: {name}\n{description}\nStack: {stack}"
 *   - 1 profile chunk per portfolio: "{name} — {bio}\nSkills: {topSkills}"
 */

import {
  CHUNK_MAX_CHARS,
  FACT_EVIDENCE_TRUNCATE_CHARS,
  type EmbeddingChunk,
} from "./types";

// ─── Input shapes (minimal — only what the chunker reads) ──────────────────

export interface ChunkerFactRow {
  id: string;
  projectId: string;
  category: string;
  claim: string;
  evidenceText: string | null;
}

export interface ChunkerDerivedFactRow {
  id: string;
  projectId: string;
  claim: string;
}

export interface ChunkerSectionRow {
  id: string;
  projectId: string;
  sectionType: string;
  /** If the owner hand-edited, prefer that over the model's draft. */
  content: string;
  userContent?: string | null;
  isUserEdited?: boolean | null;
}

export interface ChunkerProjectRow {
  id: string;
  name: string;
  description?: string | null;
  /** Free-form stack summary; "React, TypeScript, Postgres" etc. */
  stackSummary?: string | null;
}

export interface ChunkerProfileInput {
  portfolioId: string;
  ownerName: string;
  bio?: string | null;
  topSkills?: string[] | null;
}

export interface ChunkerInput {
  profile: ChunkerProfileInput;
  projects: ChunkerProjectRow[];
  /** Keyed by projectId for O(1) joins. */
  factsByProject: Map<string, ChunkerFactRow[]>;
  derivedFactsByProject: Map<string, ChunkerDerivedFactRow[]>;
  sectionsByProject: Map<string, ChunkerSectionRow[]>;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Build the complete chunk set for a portfolio. Deterministic given the
 * same input → idempotent re-embed runs produce identical chunks.
 *
 * Ordering matters for deterministic tie-breaks in retrieval:
 *   profile → projects (per-project: summary → facts → derived → narrative).
 */
export function buildChunks(input: ChunkerInput): EmbeddingChunk[] {
  const out: EmbeddingChunk[] = [];

  // 1. Profile chunk — always exactly one per portfolio.
  out.push(buildProfileChunk(input.profile));

  // 2. Per project, in the order given by the caller.
  for (const project of input.projects) {
    out.push(buildProjectSummaryChunk(project));

    const facts = input.factsByProject.get(project.id) ?? [];
    for (const f of facts) {
      out.push(buildFactChunk(f, project));
    }

    const derived = input.derivedFactsByProject.get(project.id) ?? [];
    for (const d of derived) {
      out.push(buildDerivedFactChunk(d, project));
    }

    const sections = input.sectionsByProject.get(project.id) ?? [];
    for (const s of sections) {
      out.push(...buildNarrativeChunks(s, project));
    }
  }

  return out;
}

// ─── Individual builders ────────────────────────────────────────────────────

function buildProfileChunk(profile: ChunkerProfileInput): EmbeddingChunk {
  const bio = (profile.bio ?? "").trim();
  const skills = (profile.topSkills ?? []).filter(Boolean).join(", ");

  const parts: string[] = [profile.ownerName];
  if (bio) parts.push(bio);
  if (skills) parts.push(`Skills: ${skills}`);

  return {
    chunkType: "profile",
    chunkText: parts.join("\n"),
    sourceRef: `profile:${profile.portfolioId}`,
    metadata: { portfolioId: profile.portfolioId },
  };
}

function buildProjectSummaryChunk(
  project: ChunkerProjectRow
): EmbeddingChunk {
  const desc = (project.description ?? "").trim();
  const stack = (project.stackSummary ?? "").trim();

  const parts: string[] = [`Project: ${project.name}`];
  if (desc) parts.push(desc);
  if (stack) parts.push(`Stack: ${stack}`);

  return {
    chunkType: "project_summary",
    chunkText: parts.join("\n"),
    sourceRef: `projects:${project.id}`,
    metadata: { projectId: project.id, projectName: project.name },
  };
}

function buildFactChunk(
  fact: ChunkerFactRow,
  project: ChunkerProjectRow
): EmbeddingChunk {
  const evidence = truncate(
    (fact.evidenceText ?? "").trim(),
    FACT_EVIDENCE_TRUNCATE_CHARS
  );
  const parts: string[] = [`${fact.category}: ${fact.claim}`];
  if (evidence) parts.push(`Evidence: ${evidence}`);

  return {
    chunkType: "fact",
    chunkText: parts.join("\n"),
    sourceRef: `facts:${fact.id}`,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      category: fact.category,
    },
  };
}

function buildDerivedFactChunk(
  d: ChunkerDerivedFactRow,
  project: ChunkerProjectRow
): EmbeddingChunk {
  return {
    chunkType: "derived_fact",
    chunkText: d.claim,
    sourceRef: `derivedFacts:${d.id}`,
    metadata: { projectId: project.id, projectName: project.name },
  };
}

/**
 * Split a generated section into paragraph-scoped chunks. Paragraphs
 * longer than CHUNK_MAX_CHARS are further sentence-split so no single
 * chunk blows the token budget.
 *
 * Honor `isUserEdited`: when true and `userContent` is non-empty, we
 * embed the owner's edited copy instead of the model's draft. The
 * narrative the visitor sees on the published site is the source of
 * truth.
 */
function buildNarrativeChunks(
  section: ChunkerSectionRow,
  project: ChunkerProjectRow
): EmbeddingChunk[] {
  const content =
    section.isUserEdited && section.userContent?.trim()
      ? section.userContent
      : section.content;

  const paragraphs = splitParagraphs(content);
  const out: EmbeddingChunk[] = [];

  paragraphs.forEach((para, idx) => {
    const pieces = para.length > CHUNK_MAX_CHARS ? sentenceSplit(para) : [para];
    pieces.forEach((piece, pieceIdx) => {
      out.push({
        chunkType: "narrative",
        chunkText: piece,
        sourceRef:
          pieces.length === 1
            ? `generatedSections:${section.id}#para=${idx}`
            : `generatedSections:${section.id}#para=${idx}.${pieceIdx}`,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          sectionType: section.sectionType,
        },
      });
    });
  });

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Split on blank-line paragraph boundaries. Empty paragraphs dropped. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Greedy sentence packer. Splits on `.`, `!`, `?` followed by whitespace,
 * then packs sentences back together until a group would exceed
 * CHUNK_MAX_CHARS. A single sentence longer than the cap is emitted
 * as-is (we don't hard-cut in the middle of a word).
 */
export function sentenceSplit(paragraph: string): string[] {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return [paragraph];

  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    if (buf.length + 1 + s.length <= CHUNK_MAX_CHARS) {
      buf = `${buf} ${s}`;
    } else {
      chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
