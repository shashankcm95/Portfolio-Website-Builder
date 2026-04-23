/**
 * Phase C — Per-testimonial edit + delete.
 *
 * PATCH  /api/portfolios/:pid/testimonials/:tid
 *   body: partial TestimonialCreate (see src/lib/identity/validation.ts)
 *   → 200 { testimonial: TestimonialRow }
 *
 * DELETE /api/portfolios/:pid/testimonials/:tid
 *   → 204
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { testimonials } from "@/lib/db/schema";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";
import { testimonialPatchSchema } from "@/lib/identity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: { portfolioId: string; testimonialId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = testimonialPatchSchema.safeParse(raw);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set: Record<string, any> = { updatedAt: new Date() };
  if (body.quote !== undefined) set.quote = body.quote;
  if (body.authorName !== undefined) set.authorName = body.authorName;
  if (body.authorTitle !== undefined) set.authorTitle = body.authorTitle ?? null;
  if (body.authorCompany !== undefined) set.authorCompany = body.authorCompany ?? null;
  if (body.authorUrl !== undefined) set.authorUrl = body.authorUrl ?? null;
  if (body.avatarUrl !== undefined) set.avatarUrl = body.avatarUrl ?? null;
  if (body.displayOrder !== undefined) set.displayOrder = body.displayOrder;
  if (body.isVisible !== undefined) set.isVisible = body.isVisible;

  const [updated] = await db
    .update(testimonials)
    .set(set)
    .where(
      and(
        eq(testimonials.id, params.testimonialId),
        eq(testimonials.portfolioId, params.portfolioId)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ testimonial: updated });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: { portfolioId: string; testimonialId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  const result = await db
    .delete(testimonials)
    .where(
      and(
        eq(testimonials.id, params.testimonialId),
        eq(testimonials.portfolioId, params.portfolioId)
      )
    )
    .returning({ id: testimonials.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
