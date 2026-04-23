/**
 * Phase 6 — Public analytics ingest.
 *
 * POST /api/events/track
 *   body: { portfolioId, path?, referrer?, eventType? }
 *     eventType defaults to "pageview".
 *   → 204 on accepted
 *   → 204 on dropped (bot / self-referrer / rate-limited) — silent, never
 *     leaks filter logic to the caller
 *   → 400 on bad body
 *
 * Public route (middleware allow-listed). Designed to be hit from
 * `navigator.sendBeacon()` on the published portfolio — no CORS preflight.
 *
 * Intentionally 204-on-drop: we don't want a hostile client learning
 * which UAs we treat as bots. The caller can't distinguish an accepted
 * pageview from a dropped one; the owner sees the aggregate in the
 * dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, visitorEvents } from "@/lib/db/schema";
import {
  bucketUserAgent,
  isSelfReferrer,
  normalizePath,
  sanitizeReferrer,
} from "@/lib/analytics/beacon";
import { check } from "@/lib/chatbot/rate-limit";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** Keep event types to the set we report on. Unknown → 400. */
const ALLOWED_EVENT_TYPES = new Set([
  "pageview",
  "chatbot_opened",
  "chatbot_message",
]);

interface ParsedBody {
  portfolioId: string;
  eventType: string;
  path: string | null;
  referrer: string | null;
}

function parseBody(raw: unknown): ParsedBody | string {
  if (!raw || typeof raw !== "object") return "Body must be an object";
  const b = raw as Record<string, unknown>;
  if (typeof b.portfolioId !== "string" || b.portfolioId.length === 0) {
    return "portfolioId is required";
  }
  const eventType =
    typeof b.eventType === "string" ? b.eventType : "pageview";
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return "unknown eventType";

  return {
    portfolioId: b.portfolioId,
    eventType,
    path: normalizePath(typeof b.path === "string" ? b.path : null),
    referrer:
      typeof b.referrer === "string" ? sanitizeReferrer(b.referrer) : null,
  };
}

/**
 * Phase R4 — explicit CORS headers for the cross-origin beacon.
 *
 * This route is called from every published portfolio's static HTML
 * (Cloudflare Pages origin, e.g. `foo.pages.dev` or a user custom
 * domain), which is cross-origin relative to the builder. Next's
 * same-origin default works today because `navigator.sendBeacon()`
 * doesn't require a CORS preflight for simple POSTs with
 * `text/plain`-ish bodies — but the moment someone tightens a
 * middleware or the client switches to `fetch()` with a JSON content
 * type, browsers would start blocking. Emitting `*` here is safe:
 *
 *   - Nothing in this endpoint is authenticated (it's an ingest).
 *   - A forged request costs nothing more than a valid one; the
 *     rate-limit + bot-UA + self-referrer filters still apply.
 *   - Response body is 204 with no payload to exfiltrate.
 *
 * If we ever tighten this to a specific origin (e.g. a PagesProject
 * CNAME registry), this is the single place to change.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

/** Success + silent-drop share the same 204 response. */
function accepted(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Preflight handler. Required when a published site uses `fetch()`
 * with a JSON content-type rather than `navigator.sendBeacon()` — the
 * browser sends an OPTIONS first. For `sendBeacon()` this is a no-op.
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Extract a best-effort client IP for rate limiting. Works behind
 * Cloudflare (`CF-Connecting-IP`), Vercel (`x-forwarded-for`), and
 * falls back to `x-real-ip`. No IP is ever persisted to the DB — this
 * value only keys the in-memory rate-limit bucket.
 */
function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse the body first — we do this before the rate-limit so garbage
  // requests don't consume the IP's budget.
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  const parsed = parseBody(raw);
  if (typeof parsed === "string") {
    return NextResponse.json(
      { error: parsed },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Rate limit per IP (silent drop on exhaust — never tells clients they're capped).
  if (!check("ip", clientIp(req)).allowed) return accepted();

  const ua = req.headers.get("user-agent");
  const bucket = bucketUserAgent(ua);
  if (bucket === "bot") return accepted(); // drop silently

  // Drop self-traffic (owner previewing from the app).
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (
    parsed.referrer &&
    isSelfReferrer(parsed.referrer, appOrigin)
  ) {
    return accepted();
  }

  // Verify the portfolio actually exists (prevents noise writes on spoofed IDs).
  const [portfolio] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.id, parsed.portfolioId))
    .limit(1);
  if (!portfolio) return accepted(); // silent — don't confirm ID existence

  const country = req.headers.get("cf-ipcountry") ?? null;

  try {
    await db.insert(visitorEvents).values({
      portfolioId: parsed.portfolioId,
      eventType: parsed.eventType,
      path: parsed.path,
      referrer: parsed.referrer,
      userAgentBucket: bucket,
      country,
    });
  } catch {
    // DB hiccup shouldn't surface to the beacon client.
  }

  return accepted();
}
