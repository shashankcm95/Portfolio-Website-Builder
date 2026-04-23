/**
 * Phase C — Testimonial list + create.
 *
 * GET   /api/portfolios/:pid/testimonials
 *   → 200 { testimonials: TestimonialRow[] } ordered by displayOrder asc
 *
 * POST  /api/portfolios/:pid/testimonials
 *   body: TestimonialCreate (see src/lib/identity/validation.ts)
 *   → 201 { testimonial: TestimonialRow }
 *
 * Per-row edit + delete live in `./[testimonialId]/route.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { testimonials } from "@/lib/db/schema";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";
import { testimonialCreateSchema } from "@/lib/identity/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  // Return all (visible + hidden) — the editor needs to toggle visibility.
  const rows = await db
    .select()
    .from(testimonials)
    .where(eq(testimonials.portfolioId, params.portfolioId))
    .orderBy(asc(testimonials.displayOrder));

  return NextResponse.json({ testimonials: rows });
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = testimonialCreateSchema.safeParse(raw);
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

  // If displayOrder isn't supplied, append to the end. Querying max() +
  // inserting isn't atomic, but concurrent writes by the same owner are
  // extremely unlikely; worst case two rows share an order and the UI
  // orders by createdAt as a tiebreaker.
  let displayOrder = parsed.data.displayOrder;
  if (displayOrder === undefined) {
    const [tail] = await db
      .select({ max: max(testimonials.displayOrder) })
      .from(testimonials)
      .where(eq(testimonials.portfolioId, params.portfolioId));
    displayOrder = (tail?.max ?? -1) + 1;
  }

  const [row] = await db
    .insert(testimonials)
    .values({
      portfolioId: params.portfolioId,
      quote: parsed.data.quote,
      authorName: parsed.data.authorName,
      authorTitle: parsed.data.authorTitle ?? null,
      authorCompany: parsed.data.authorCompany ?? null,
      authorUrl: parsed.data.authorUrl ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
      displayOrder,
      isVisible: parsed.data.isVisible ?? true,
    })
    .returning();

  return NextResponse.json({ testimonial: row }, { status: 201 });
}
