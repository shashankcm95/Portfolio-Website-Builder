/**
 * Phase C — Identity & pitch editor.
 *
 * One consolidated PATCH handles every Tier-1 portfolio-level field the
 * editor exposes: positioning, namedEmployers, hire status + CTA,
 * anchorStatOverride. Bundling the fields into one endpoint mirrors how
 * the editor saves them (one form, one "save" click) and keeps the API
 * surface predictable as more fields are added.
 *
 * GET   returns the current values so the editor can populate the form
 *       without a separate full-portfolio fetch.
 * PATCH merges any subset of fields; omitted fields are untouched.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";
import { identityPatchSchema } from "@/lib/identity/validation";

// Prevents static prerender during `next build`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/portfolios/:pid/identity ───────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  const [row] = await db
    .select({
      positioning: portfolios.positioning,
      namedEmployers: portfolios.namedEmployers,
      hireStatus: portfolios.hireStatus,
      hireCtaText: portfolios.hireCtaText,
      hireCtaHref: portfolios.hireCtaHref,
      anchorStatOverride: portfolios.anchorStatOverride,
    })
    .from(portfolios)
    .where(eq(portfolios.id, params.portfolioId))
    .limit(1);

  // Authz already confirmed the row exists; this defensive check satisfies TS.
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ identity: row });
}

// ─── PATCH /api/portfolios/:pid/identity ─────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = identityPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid fields",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Build the update set only from keys the client explicitly sent. `null`
  // is an intentional clear; `undefined` means the client didn't touch the
  // field and we leave the DB value alone.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set: Record<string, any> = { updatedAt: new Date() };
  if (body.positioning !== undefined) {
    set.positioning =
      body.positioning === null || body.positioning.trim() === ""
        ? null
        : body.positioning;
  }
  if (body.namedEmployers !== undefined) {
    set.namedEmployers = body.namedEmployers;
  }
  if (body.hireStatus !== undefined) {
    set.hireStatus = body.hireStatus;
  }
  if (body.hireCtaText !== undefined) {
    set.hireCtaText =
      body.hireCtaText === null || body.hireCtaText.trim() === ""
        ? null
        : body.hireCtaText;
  }
  if (body.hireCtaHref !== undefined) {
    set.hireCtaHref =
      body.hireCtaHref === null || body.hireCtaHref.trim() === ""
        ? null
        : body.hireCtaHref;
  }
  if (body.anchorStatOverride !== undefined) {
    set.anchorStatOverride = body.anchorStatOverride;
  }

  // Nothing to change ⇒ idempotent no-op. Still return the current state so
  // the editor refreshes from the source of truth.
  if (Object.keys(set).length === 1) {
    const [current] = await db
      .select({
        positioning: portfolios.positioning,
        namedEmployers: portfolios.namedEmployers,
        hireStatus: portfolios.hireStatus,
        hireCtaText: portfolios.hireCtaText,
        hireCtaHref: portfolios.hireCtaHref,
        anchorStatOverride: portfolios.anchorStatOverride,
      })
      .from(portfolios)
      .where(eq(portfolios.id, params.portfolioId))
      .limit(1);
    return NextResponse.json({ identity: current });
  }

  const [updated] = await db
    .update(portfolios)
    .set(set)
    .where(eq(portfolios.id, params.portfolioId))
    .returning({
      positioning: portfolios.positioning,
      namedEmployers: portfolios.namedEmployers,
      hireStatus: portfolios.hireStatus,
      hireCtaText: portfolios.hireCtaText,
      hireCtaHref: portfolios.hireCtaHref,
      anchorStatOverride: portfolios.anchorStatOverride,
    });

  return NextResponse.json({ identity: updated });
}
