/**
 * Phase 6 — Soft-revoke a share link.
 *
 * DELETE /api/portfolios/:portfolioId/share-links/:tokenId
 *   → 204 on success
 *   → 401/403/404 on auth / ownership / not-found
 *
 * "Soft" = sets `revokedAt` to now, keeps the row for view-count
 * history. The `/share/[token]` public route checks `revokedAt IS NULL`
 * so revoked tokens 404 immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, shareTokens } from "@/lib/db/schema";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; tokenId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check: portfolio must belong to caller.
  const [portfolioRow] = await db
    .select({ id: portfolios.id, userId: portfolios.userId })
    .from(portfolios)
    .where(eq(portfolios.id, params.portfolioId))
    .limit(1);
  if (!portfolioRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (portfolioRow.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Confirm the token row exists under this portfolio (prevents a foreign
  // portfolioId from revoking someone else's token by id).
  const [tokenRow] = await db
    .select({ id: shareTokens.id })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.id, params.tokenId),
        eq(shareTokens.portfolioId, params.portfolioId)
      )
    )
    .limit(1);
  if (!tokenRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(shareTokens)
    .set({ revokedAt: new Date() })
    .where(eq(shareTokens.id, params.tokenId));

  return new NextResponse(null, { status: 204 });
}
