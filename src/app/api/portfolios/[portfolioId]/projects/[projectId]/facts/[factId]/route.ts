/**
 * Phase 10 — Track F: editable facts.
 *
 * PATCH /api/portfolios/:portfolioId/projects/:projectId/facts/:factId
 *
 * Lets the owner edit a single extracted fact's `claim`, `category`, or
 * `confidence`. Authorization traverses fact → project → portfolio → user.
 * On success, stamps `ownerEdited: true` so the UI can surface an
 * "edited by owner" chip and downstream regenerators can preserve the
 * owner's wording.
 *
 * Validation:
 *   - `claim` (optional) — string, 1..500 chars after trim.
 *   - `category` (optional) — string, 1..100 chars (facts.category is
 *     free-form text in the schema; we just bound the length).
 *   - `confidence` (optional) — number in [0, 1].
 *   - At least one of the three must be present.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { facts, projects, portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLAIM_CHARS = 500;
const MAX_CATEGORY_CHARS = 100;

async function authorizeFact(
  portfolioId: string,
  projectId: string,
  factId: string
) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const [row] = await db
    .select({
      fact: facts,
      portfolioUserId: portfolios.userId,
      portfolioId: portfolios.id,
      projectId: projects.id,
    })
    .from(facts)
    .innerJoin(projects, eq(facts.projectId, projects.id))
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(facts.id, factId),
        eq(facts.projectId, projectId),
        eq(projects.portfolioId, portfolioId)
      )
    )
    .limit(1);

  if (!row) {
    return {
      error: NextResponse.json({ error: "Fact not found" }, { status: 404 }),
    };
  }
  if (row.portfolioUserId !== session.user.id) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { fact: row.fact };
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: { portfolioId: string; projectId: string; factId: string };
  }
) {
  const authResult = await authorizeFact(
    params.portfolioId,
    params.projectId,
    params.factId
  );
  if ("error" in authResult) return authResult.error;

  let body: {
    claim?: unknown;
    category?: unknown;
    confidence?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("claim" in body && body.claim !== undefined) {
    if (typeof body.claim !== "string") {
      return NextResponse.json(
        { error: "claim must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.claim.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_CLAIM_CHARS) {
      return NextResponse.json(
        {
          error: `claim must be 1..${MAX_CLAIM_CHARS} characters`,
        },
        { status: 400 }
      );
    }
    updates.claim = trimmed;
  }

  if ("category" in body && body.category !== undefined) {
    if (typeof body.category !== "string") {
      return NextResponse.json(
        { error: "category must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.category.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_CATEGORY_CHARS) {
      return NextResponse.json(
        {
          error: `category must be 1..${MAX_CATEGORY_CHARS} characters`,
        },
        { status: 400 }
      );
    }
    updates.category = trimmed;
  }

  if ("confidence" in body && body.confidence !== undefined) {
    if (
      typeof body.confidence !== "number" ||
      !Number.isFinite(body.confidence) ||
      body.confidence < 0 ||
      body.confidence > 1
    ) {
      return NextResponse.json(
        { error: "confidence must be a number between 0 and 1" },
        { status: 400 }
      );
    }
    updates.confidence = body.confidence;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  updates.ownerEdited = true;

  const [updated] = await db
    .update(facts)
    .set(updates)
    .where(eq(facts.id, params.factId))
    .returning();

  return NextResponse.json({ fact: updated });
}
