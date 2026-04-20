import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatedSections, projects, portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { regenerateSection } from "@/lib/pipeline/orchestrator";
import {
  LlmInvalidKeyError,
  LlmNotConfiguredError,
} from "@/lib/ai/providers/types";

/**
 * POST /api/projects/[projectId]/sections/[sectionId]/regenerate
 *
 * Regenerate a single narrative section using cached facts + context pack —
 * avoids re-running the full 7-step pipeline for a one-section tweak.
 *
 * Returns the updated section row.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { projectId: string; sectionId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auth + locate the existing section (to know its sectionType / variant)
  const [row] = await db
    .select({
      section: generatedSections,
      portfolioUserId: portfolios.userId,
    })
    .from(generatedSections)
    .innerJoin(projects, eq(generatedSections.projectId, projects.id))
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(generatedSections.id, params.sectionId),
        eq(generatedSections.projectId, params.projectId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (row.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await regenerateSection(
      params.projectId,
      row.section.sectionType,
      row.section.variant
    );
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: "llm_not_configured" },
        { status: 409 }
      );
    }
    if (err instanceof LlmInvalidKeyError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "llm_invalid_key",
          provider: err.provider,
        },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Regeneration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Fetch the fresh section to return to the client
  const [updated] = await db
    .select()
    .from(generatedSections)
    .where(eq(generatedSections.id, params.sectionId))
    .limit(1);

  return NextResponse.json({ section: updated });
}
