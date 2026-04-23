import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  MAX_GREETING_CHARS,
  MAX_STARTER_CHARS,
  MAX_STARTERS,
} from "@/lib/chatbot/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAuthenticatedPortfolio(portfolioId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, portfolioId), eq(portfolios.userId, session.user.id))
    )
    .limit(1);

  if (!portfolio) return { error: "Not found", status: 404 };
  return { portfolio, userId: session.user.id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const portfolioProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.portfolioId, result.portfolio.id))
    .orderBy(projects.displayOrder);

  return NextResponse.json({
    portfolio: result.portfolio,
    projects: portfolioProjects,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const updates = await req.json();
  const allowedFields = [
    "name",
    "slug",
    "templateId",
    "settings",
    "status",
    // Phase 5 — visitor chatbot toggle. Boolean only; coerced below.
    "chatbotEnabled",
    // Phase 5.2 — owner-authored greeting + starter chips.
    "chatbotGreeting",
    "chatbotStarters",
    // Phase 9 — host the chatbot on the published site via a Pages
    // Function + Workers AI instead of proxying through the builder.
    "selfHostedChatbot",
  ];
  const filteredUpdates: Record<string, any> = {};

  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }
  if ("chatbotEnabled" in filteredUpdates) {
    filteredUpdates.chatbotEnabled = Boolean(filteredUpdates.chatbotEnabled);
  }
  if ("selfHostedChatbot" in filteredUpdates) {
    // Strict boolean — reject anything else to keep the DB column clean.
    if (typeof filteredUpdates.selfHostedChatbot !== "boolean") {
      return NextResponse.json(
        { error: "selfHostedChatbot must be a boolean" },
        { status: 400 }
      );
    }
  }

  // Phase 5.2 validation — greeting is a nullable string ≤ MAX_GREETING_CHARS;
  // starters is an array of up to MAX_STARTERS strings, each ≤ MAX_STARTER_CHARS.
  if ("chatbotGreeting" in filteredUpdates) {
    const g = filteredUpdates.chatbotGreeting;
    if (g === null || g === "") {
      filteredUpdates.chatbotGreeting = null;
    } else if (typeof g !== "string") {
      return NextResponse.json(
        { error: "chatbotGreeting must be a string or null" },
        { status: 400 }
      );
    } else {
      const trimmed = g.trim();
      if (trimmed.length > MAX_GREETING_CHARS) {
        return NextResponse.json(
          { error: `chatbotGreeting exceeds ${MAX_GREETING_CHARS} characters` },
          { status: 400 }
        );
      }
      // Reject control chars (tabs OK; newlines OK; other C0 rejected) to
      // prevent pathological formatting in owner-authored text.
      if (/[\x00-\x08\x0B-\x1F\x7F]/.test(trimmed)) {
        return NextResponse.json(
          { error: "chatbotGreeting contains disallowed control characters" },
          { status: 400 }
        );
      }
      filteredUpdates.chatbotGreeting = trimmed.length === 0 ? null : trimmed;
    }
  }

  if ("chatbotStarters" in filteredUpdates) {
    const s = filteredUpdates.chatbotStarters;
    if (!Array.isArray(s)) {
      return NextResponse.json(
        { error: "chatbotStarters must be an array" },
        { status: 400 }
      );
    }
    if (s.length > MAX_STARTERS) {
      return NextResponse.json(
        { error: `chatbotStarters accepts at most ${MAX_STARTERS} items` },
        { status: 400 }
      );
    }
    const cleaned: string[] = [];
    for (const item of s) {
      if (typeof item !== "string") {
        return NextResponse.json(
          { error: "chatbotStarters items must be strings" },
          { status: 400 }
        );
      }
      const t = item.trim();
      if (t.length === 0) continue; // silently drop blanks
      if (t.length > MAX_STARTER_CHARS) {
        return NextResponse.json(
          {
            error: `chatbotStarters items must be ≤ ${MAX_STARTER_CHARS} characters`,
          },
          { status: 400 }
        );
      }
      if (/[\x00-\x08\x0B-\x1F\x7F]/.test(t)) {
        return NextResponse.json(
          { error: "chatbotStarters items contain disallowed control characters" },
          { status: 400 }
        );
      }
      cleaned.push(t);
    }
    filteredUpdates.chatbotStarters = cleaned;
  }

  filteredUpdates.updatedAt = new Date();

  const [updated] = await db
    .update(portfolios)
    .set(filteredUpdates)
    .where(eq(portfolios.id, params.portfolioId))
    .returning();

  return NextResponse.json({ portfolio: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const result = await getAuthenticatedPortfolio(params.portfolioId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  await db.delete(portfolios).where(eq(portfolios.id, params.portfolioId));

  return NextResponse.json({ success: true });
}
