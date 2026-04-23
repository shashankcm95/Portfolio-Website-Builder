import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  generatedSections,
  claimMap,
  facts,
  projects,
  portfolios,
} from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the full claim map for a project so the narrative UI can render
 * sentence-level verification and drill into backing evidence.
 *
 * Shape:
 *   { claimsBySection: { [sectionId]: ClaimRow[] }, facts: FactRow[] }
 *
 * The `factIds` in each claim row are positional (1-based) references into
 * the `facts` array — this is what the LLM returned during verification.
 * The facts list is ordered by createdAt to match the order the LLM saw.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auth: project → portfolio → user
  const [project] = await db
    .select({ id: projects.id, portfolioUserId: portfolios.userId })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(eq(projects.id, params.projectId))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Collect section IDs for this project
  const sectionIds = (
    await db
      .select({ id: generatedSections.id })
      .from(generatedSections)
      .where(eq(generatedSections.projectId, params.projectId))
  ).map((s) => s.id);

  const claimRows =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(claimMap)
          .where(inArray(claimMap.sectionId, sectionIds));

  const factRows = await db
    .select()
    .from(facts)
    .where(eq(facts.projectId, params.projectId))
    .orderBy(asc(facts.createdAt));

  // Group claims by sectionId, parsing the JSON-encoded factIds column
  const claimsBySection: Record<
    string,
    Array<{
      id: string;
      sentenceIndex: number;
      sentenceText: string;
      factIds: string[];
      verification: string;
      confidence: number | null;
    }>
  > = {};

  for (const row of claimRows) {
    let parsedFactIds: string[] = [];
    try {
      const parsed = JSON.parse(row.factIds);
      if (Array.isArray(parsed)) {
        parsedFactIds = parsed.map(String);
      }
    } catch {
      // Malformed JSON in factIds — ignore, leave empty; this only hides
      // the row's linked facts, not the sentence itself.
    }

    if (!claimsBySection[row.sectionId]) {
      claimsBySection[row.sectionId] = [];
    }
    claimsBySection[row.sectionId].push({
      id: row.id,
      sentenceIndex: row.sentenceIndex,
      sentenceText: row.sentenceText,
      factIds: parsedFactIds,
      verification: row.verification,
      confidence: row.confidence,
    });
  }

  // Sort each section's claims by sentenceIndex
  for (const id of Object.keys(claimsBySection)) {
    claimsBySection[id].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  }

  return NextResponse.json({
    claimsBySection,
    facts: factRows.map((f) => ({
      id: f.id,
      claim: f.claim,
      category: f.category,
      confidence: f.confidence,
      evidenceType: f.evidenceType,
      evidenceRef: f.evidenceRef,
      evidenceText: f.evidenceText,
    })),
  });
}
