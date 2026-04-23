import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, params.portfolioId),
        eq(portfolios.userId, session.user.id)
      )
    )
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { domainId } = await req.json();

  const [domain] = await db
    .select()
    .from(domains)
    .where(
      and(eq(domains.id, domainId), eq(domains.portfolioId, params.portfolioId))
    )
    .limit(1);

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Verify DNS
  const { verifyDomain } = await import("@/lib/deployer/domain-manager");
  const result = await verifyDomain(
    domain.domain,
    domain.dnsTarget || ""
  );

  // Update domain status
  await db
    .update(domains)
    .set({
      verificationStatus: result.verified ? "verified" : "pending",
      lastChecked: new Date(),
      verifiedAt: result.verified ? new Date() : null,
      sslStatus: result.verified ? "active" : "pending",
      updatedAt: new Date(),
    })
    .where(eq(domains.id, domainId));

  return NextResponse.json({
    verified: result.verified,
    error: result.error,
  });
}
