import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  portfolios,
  projects,
  facts,
  generatedSections,
  projectDemos,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import type { DemoType, ProjectDemo } from "@/lib/demos/types";

async function getAuthenticatedProject(
  portfolioId: string,
  projectId: string
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, portfolioId), eq(portfolios.userId, session.user.id))
    )
    .limit(1);

  if (!portfolio) return { error: "Portfolio not found", status: 404 };

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.portfolioId, portfolioId)
      )
    )
    .limit(1);

  if (!project) return { error: "Project not found", status: 404 };

  return { project, portfolio, userId: session.user.id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const result = await getAuthenticatedProject(
    params.portfolioId,
    params.projectId
  );
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  // Fetch facts and narratives
  const projectFacts = await db
    .select()
    .from(facts)
    .where(eq(facts.projectId, params.projectId));

  const sections = await db
    .select()
    .from(generatedSections)
    .where(eq(generatedSections.projectId, params.projectId));

  // Phase 4: include ordered demos so the detail page hydrates the
  // <ProjectDemo> / <DemoForm> / storyboard Card 6 merge without a
  // second round-trip.
  const demoRows = await db
    .select()
    .from(projectDemos)
    .where(eq(projectDemos.projectId, params.projectId))
    .orderBy(asc(projectDemos.order));

  const demos: ProjectDemo[] = demoRows.map((r) => ({
    id: r.id,
    url: r.url,
    type: r.type as DemoType,
    title: r.title,
    order: r.order,
  }));

  return NextResponse.json({
    project: result.project,
    facts: projectFacts,
    sections,
    demos,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const result = await getAuthenticatedProject(
    params.portfolioId,
    params.projectId
  );
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const updates = await req.json();
  const allowedFields = [
    "displayName",
    "displayOrder",
    "isVisible",
    "isFeatured",
  ];
  const filteredUpdates: Record<string, any> = {};

  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }
  filteredUpdates.updatedAt = new Date();

  const [updated] = await db
    .update(projects)
    .set(filteredUpdates)
    .where(eq(projects.id, params.projectId))
    .returning();

  return NextResponse.json({ project: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const result = await getAuthenticatedProject(
    params.portfolioId,
    params.projectId
  );
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  await db.delete(projects).where(eq(projects.id, params.projectId));

  return NextResponse.json({ success: true });
}
