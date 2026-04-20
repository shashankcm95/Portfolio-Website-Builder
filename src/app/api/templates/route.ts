import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

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
    })
    .from(templates)
    .where(eq(templates.isActive, true))
    .orderBy(asc(templates.name));

  return NextResponse.json({ templates: rows });
}
