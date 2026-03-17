import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, domains, deployments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
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

  const portfolioDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.portfolioId, params.portfolioId));

  return NextResponse.json({ domains: portfolioDomains });
}

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

  const { domain: domainName } = await req.json();

  if (!domainName || typeof domainName !== "string") {
    return NextResponse.json(
      { error: "Domain name is required" },
      { status: 400 }
    );
  }

  // Get the CF project name from latest deployment
  const [latestDeployment] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.portfolioId, params.portfolioId))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  const cfTarget = latestDeployment?.cfProjectName
    ? `${latestDeployment.cfProjectName}.pages.dev`
    : "your-project.pages.dev";

  // Generate DNS instructions
  const { generateDnsInstructions } = await import(
    "@/lib/deployer/domain-manager"
  );
  const instructions = generateDnsInstructions(domainName, cfTarget);

  try {
    const [newDomain] = await db
      .insert(domains)
      .values({
        portfolioId: params.portfolioId,
        domain: domainName.toLowerCase(),
        dnsTarget: cfTarget,
        dnsRecordType: instructions.recordType,
      })
      .returning();

    return NextResponse.json(
      {
        domain: newDomain,
        instructions,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This domain is already registered" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to add domain" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  await db.delete(domains).where(eq(domains.id, domainId));

  return NextResponse.json({ success: true });
}
