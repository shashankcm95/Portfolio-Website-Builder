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
        // Phase R6 — fetch profileData so we can derive the owner's first
        // name for the default greeting when no owner-authored copy is set.
        profileData: portfolios.profileData,
      })
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);

    if (!row) return { greeting: null, starters: [] };

    const authored =
      typeof row.greeting === "string" && row.greeting.trim()
        ? row.greeting.trim()
        : null;

    // Phase R6 — fall back to a default greeting that names the owner so
    // the panel doesn't open to a blank transcript when no greeting was
    // configured. The owner-authored greeting always wins when set.
    const ownerName = (() => {
      const pd = (row.profileData as Record<string, unknown> | null) ?? {};
      const basics = (pd.basics as Record<string, unknown> | undefined) ?? {};
      const name = typeof basics.name === "string" ? basics.name.trim() : "";
      return name;
    })();

    const greeting = authored ?? buildDefaultGreeting(ownerName);

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

function buildDefaultGreeting(ownerName: string): string | null {
  if (!ownerName) return null;
  const firstName = ownerName.split(/\s+/)[0];
  return `Hi! I'm here to answer questions about ${firstName}'s work — projects, skills, experience, availability. What would you like to know?`;
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
