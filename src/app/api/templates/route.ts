import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public list of active templates for the portfolio creation picker and the
 * portfolio settings template selector.
 */
export async function GET() {
  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      previewUrl: templates.previewUrl,
      isPremium: templates.isPremium,
      // Phase 7 — config carries the audience tags the picker shows
      // as chips. Returning the full jsonb keeps future fields free.
      config: templates.config,
    })
    .from(templates)
    .where(eq(templates.isActive, true))
    .orderBy(asc(templates.name));

  return NextResponse.json({ templates: rows });
}
