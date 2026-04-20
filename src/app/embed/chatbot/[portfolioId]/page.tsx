/**
 * Phase 5 — Visitor chatbot iframe page.
 *
 * Server component — fetches the portfolio's public chatbot config
 * (owner-authored greeting + up to 3 starter chips) from the DB and
 * hands them to the client component as props. No API round-trip from
 * the browser.
 *
 * If the portfolio has `chatbotEnabled=false` we still render the widget
 * — the API endpoints return 404 for disabled portfolios, so the user's
 * first click surfaces the "unavailable" state. This keeps the iframe
 * harmless on stale static deploys where the toggle was flipped off
 * between builds.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import {
  MAX_STARTER_CHARS,
  MAX_STARTERS,
  type ChatbotPublicConfig,
} from "@/lib/chatbot/types";
import { EmbedChatbotClient } from "./client";

export const dynamic = "force-dynamic";

async function loadConfig(
  portfolioId: string
): Promise<ChatbotPublicConfig> {
  try {
    const [row] = await db
      .select({
        greeting: portfolios.chatbotGreeting,
        starters: portfolios.chatbotStarters,
      })
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);

    if (!row) return { greeting: null, starters: [] };

    const greeting =
      typeof row.greeting === "string" && row.greeting.trim()
        ? row.greeting
        : null;

    const starters = Array.isArray(row.starters)
      ? (row.starters as unknown[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim().slice(0, MAX_STARTER_CHARS))
          .slice(0, MAX_STARTERS)
      : [];

    return { greeting, starters };
  } catch {
    // DB errors shouldn't block the widget — render with defaults.
    return { greeting: null, starters: [] };
  }
}

export default async function EmbedChatbotPage({
  params,
}: {
  params: { portfolioId: string };
}) {
  const config = await loadConfig(params.portfolioId);
  return (
    <EmbedChatbotClient portfolioId={params.portfolioId} config={config} />
  );
}
