/**
 * Phase 6 — Owner-facing analytics aggregation.
 *
 * GET /api/portfolios/:portfolioId/analytics
 *   → 200 AnalyticsSummary
 *   → 401 / 403 / 404 on auth / ownership / not-found.
 *
 * Queries the last 14 days of `visitor_events` for this portfolio,
 * returns the shape the `<PortfolioAnalytics>` Analytics tab renders.
 * Intentionally ships one DB fetch + one JS aggregation pass — simpler
 * to read than a handful of grouped SQL queries at this scale (a
 * portfolio with 10k views/week is ~120KB of rows, tolerable).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { visitorEvents } from "@/lib/db/schema";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** Days of history considered. Split into "current 7d" vs "prior 7d". */
const WINDOW_DAYS = 14;
const HALF = 7;

type EventType = "pageview" | "chatbot_opened" | "chatbot_message";

interface EventRow {
  eventType: string;
  path: string | null;
  referrer: string | null;
  country: string | null;
  createdAt: Date;
}

export interface AnalyticsSummary {
  /** Total pageviews in the most-recent 7-day window. */
  pageviewsCurrent: number;
  /** Total pageviews in the 7 days before that. */
  pageviewsPrevious: number;
  /** 14 daily pageview counts (oldest first, length = 14). */
  pageviewsDaily: Array<{ date: string; count: number }>;
  /** Sum of chatbot_message events in the current 7d. */
  chatbotMessagesCurrent: number;
  chatbotMessagesPrevious: number;
  /** Top paths by pageview count (current 7d). */
  topPaths: Array<{ path: string; count: number }>;
  /** Top referrer origins by pageview count (current 7d). Excludes null. */
  topReferrers: Array<{ referrer: string; count: number }>;
  /** Top countries by pageview count (current 7d). */
  topCountries: Array<{ country: string; count: number }>;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgoUtc(n: number, now: Date = new Date()): Date {
  const base = startOfDayUtc(now);
  return new Date(base.getTime() - n * 24 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function topN<K extends string>(
  counts: Map<K, number>,
  n: number
): Array<{ key: K; count: number }> {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  const now = new Date();
  const windowStart = daysAgoUtc(WINDOW_DAYS - 1, now); // 14 day buckets incl. today

  const rows: EventRow[] = await db
    .select({
      eventType: visitorEvents.eventType,
      path: visitorEvents.path,
      referrer: visitorEvents.referrer,
      country: visitorEvents.country,
      createdAt: visitorEvents.createdAt,
    })
    .from(visitorEvents)
    .where(
      and(
        eq(visitorEvents.portfolioId, params.portfolioId),
        gte(visitorEvents.createdAt, windowStart)
      )
    );

  // Pre-compute bucket boundaries.
  const cutoff = daysAgoUtc(HALF, now);

  // Daily buckets seeded with zeros so gaps still render as points.
  const dailyMap = new Map<string, number>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dailyMap.set(isoDate(daysAgoUtc(i, now)), 0);
  }

  let pageviewsCurrent = 0;
  let pageviewsPrevious = 0;
  let chatbotMessagesCurrent = 0;
  let chatbotMessagesPrevious = 0;
  const pathCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  for (const r of rows) {
    const isCurrent = r.createdAt >= cutoff;
    const day = isoDate(startOfDayUtc(r.createdAt));
    if (r.eventType === "pageview") {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
      if (isCurrent) pageviewsCurrent++;
      else pageviewsPrevious++;

      if (isCurrent) {
        if (r.path) pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
        if (r.referrer)
          referrerCounts.set(
            r.referrer,
            (referrerCounts.get(r.referrer) ?? 0) + 1
          );
        if (r.country)
          countryCounts.set(
            r.country,
            (countryCounts.get(r.country) ?? 0) + 1
          );
      }
    } else if (r.eventType === "chatbot_message") {
      if (isCurrent) chatbotMessagesCurrent++;
      else chatbotMessagesPrevious++;
    }
  }

  const summary: AnalyticsSummary = {
    pageviewsCurrent,
    pageviewsPrevious,
    pageviewsDaily: [...dailyMap.entries()].map(([date, count]) => ({
      date,
      count,
    })),
    chatbotMessagesCurrent,
    chatbotMessagesPrevious,
    topPaths: topN(pathCounts, 5).map(({ key, count }) => ({
      path: key,
      count,
    })),
    topReferrers: topN(referrerCounts, 5).map(({ key, count }) => ({
      referrer: key,
      count,
    })),
    topCountries: topN(countryCounts, 5).map(({ key, count }) => ({
      country: key,
      count,
    })),
  };

  return NextResponse.json(summary);
}
