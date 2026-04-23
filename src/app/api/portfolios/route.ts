import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/log";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase R6.1 — cap list queries so a single user can't accidentally
// (or adversarially) trigger an unbounded scan. Best-effort pagination;
// no total-count, callers page by bumping offset until fewer than
// `limit` rows come back.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Parse a positive-integer query param. Returns:
 *   - number  → parsed value
 *   - null    → param absent (use default)
 *   - string  → error message
 */
function parsePositiveInt(
  raw: string | null,
  name: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): number | null | string {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) return `${name} must be a positive integer`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${name} must be a positive integer`;
  if (!allowZero && n <= 0) return `${name} must be a positive integer`;
  if (allowZero && n < 0) return `${name} must be a positive integer`;
  return n;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const limitParsed = parsePositiveInt(searchParams.get("limit"), "limit");
  if (typeof limitParsed === "string") {
    return NextResponse.json({ error: limitParsed }, { status: 400 });
  }
  const offsetParsed = parsePositiveInt(
    searchParams.get("offset"),
    "offset",
    { allowZero: true }
  );
  if (typeof offsetParsed === "string") {
    return NextResponse.json({ error: offsetParsed }, { status: 400 });
  }

  const limit = limitParsed ?? DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must be <= ${MAX_LIMIT}` },
      { status: 400 }
    );
  }
  const offset = offsetParsed ?? 0;

  const userPortfolios = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, session.user.id))
    .orderBy(portfolios.createdAt)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ portfolios: userPortfolios });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, slug, templateId } = await req.json();

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Sanitize slug
    const sanitizedSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const [portfolio] = await db
      .insert(portfolios)
      .values({
        userId: session.user.id,
        name,
        slug: sanitizedSlug,
        templateId: templateId || "minimal",
      })
      .returning();

    return NextResponse.json({ portfolio }, { status: 201 });
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A portfolio with this slug already exists" },
        { status: 409 }
      );
    }
    logger.error("Portfolio creation error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to create portfolio" },
      { status: 500 }
    );
  }
}
