import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";

export interface AuthorizeOk {
  error?: undefined;
  userId: string;
}
export interface AuthorizeErr {
  error: NextResponse;
  userId?: undefined;
}
export type AuthorizeResult = AuthorizeOk | AuthorizeErr;

/**
 * Phase C — shared portfolio-owner guard.
 *
 * Mirrors the inline `authorize()` helpers duplicated across Phase 5/6/9
 * routes (share-links, domains, deploy, preview, …). New routes should
 * prefer this helper; existing routes keep their inline copies until we
 * do a dedicated cleanup pass. Same shape + same status codes, so
 * swapping in or out is mechanical.
 *
 * Returns `{ userId }` on success or `{ error: NextResponse }` on failure.
 * Callers early-return the response on the error branch.
 */
export async function authorizePortfolio(
  portfolioId: string
): Promise<AuthorizeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const [row] = await db
    .select({ id: portfolios.id, userId: portfolios.userId })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!row) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if (row.userId !== session.user.id) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: session.user.id };
}
