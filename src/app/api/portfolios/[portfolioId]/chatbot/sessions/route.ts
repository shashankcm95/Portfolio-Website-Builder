/**
 * Phase 5 — Owner-facing transcript list.
 *
 * GET /api/portfolios/:portfolioId/chatbot/sessions
 *   → 200 { sessions: [{ id, visitorId, updatedAt, messageCount,
 *                         preview: { lastVisitorMessage, lastAssistantReply } }] }
 *   → 401 unauthenticated
 *   → 403 not the portfolio owner
 *   → 404 portfolio not found
 *
 * Returns the 25 most-recently-updated sessions. Used by the owner's
 * settings card to show "what have visitors been asking?". The visitor-
 * facing endpoint that writes these (`POST /api/chatbot/message`) is
 * unauthenticated; THIS endpoint is strictly owner-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatbotSessions, portfolios } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/chatbot/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SESSIONS = 25;

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [portfolio] = await db
    .select({ id: portfolios.id, userId: portfolios.userId })
    .from(portfolios)
    .where(eq(portfolios.id, params.portfolioId))
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }
  if (portfolio.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(chatbotSessions)
    .where(eq(chatbotSessions.portfolioId, params.portfolioId))
    .orderBy(desc(chatbotSessions.updatedAt))
    .limit(MAX_SESSIONS);

  const summaries = rows.map((row) => {
    const messages = (
      Array.isArray(row.messages) ? (row.messages as ChatMessage[]) : []
    ).filter(
      (m): m is ChatMessage =>
        m !== null &&
        typeof m === "object" &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant")
    );

    const lastVisitor = [...messages].reverse().find((m) => m.role === "user");
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    return {
      id: row.id,
      visitorId: row.visitorId,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      messageCount: messages.length,
      preview: {
        lastVisitorMessage: lastVisitor?.content ?? null,
        lastAssistantReply: lastAssistant?.content ?? null,
      },
    };
  });

  return NextResponse.json({ sessions: summaries });
}
