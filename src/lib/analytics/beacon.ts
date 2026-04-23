/**
 * Phase 6 — Server-side helpers for the visitor-analytics beacon.
 *
 * Owns:
 *   - User-agent bucketing ("desktop" | "mobile" | "bot" | "other")
 *   - Referrer sanitization (origin-only, never paths/query/hash)
 *   - Bot regex used to drop crawler hits from the count
 *
 * No DB, no fetches — pure string helpers so they're trivially
 * unit-testable and usable from both the ingest route and any future
 * aggregation worker.
 */

/**
 * Valid values for `visitor_events.user_agent_bucket`. "unknown" is
 * written when the UA header is missing or empty.
 */
export type UserAgentBucket =
  | "desktop"
  | "mobile"
  | "bot"
  | "other"
  | "unknown";

/**
 * Regex for common bot / crawler / link-preview user-agents. This is
 * intentionally conservative — we'd rather over-count real humans than
 * miss an abusive scraper. All major social scrapers (Twitterbot,
 * Facebookexternalhit, Slackbot, etc.) match the "bot" pattern.
 */
const BOT_RE =
  /bot|crawler|spider|preview|headless|ahrefs|semrush|lighthouse|google-structured-data-testing-tool|google-inspectiontool|iframely|embedly|discordbot|slackbot|twitterbot|facebookexternalhit|linkedinbot|pinterest|whatsapp|quora link preview|bingbot|yandex|duckduckbot/i;

const MOBILE_RE = /mobile|iphone|ipad|android|silk|kindle|opera mini/i;

/**
 * Bucket a user-agent string into one of five coarse categories.
 * Deterministic + side-effect free; tested directly.
 */
export function bucketUserAgent(ua: string | null | undefined): UserAgentBucket {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (BOT_RE.test(s)) return "bot";
  if (MOBILE_RE.test(s)) return "mobile";
  if (
    s.includes("windows") ||
    s.includes("macintosh") ||
    s.includes("linux") ||
    s.includes("cros")
  ) {
    return "desktop";
  }
  return "other";
}

/**
 * Reduce a Referer header to origin-only (scheme + host). Drops paths,
 * query strings, and fragments so we never persist a URL that encodes
 * personal state (e.g. a referral from a gmail thread). Returns null
 * for malformed inputs.
 */
export function sanitizeReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    // Malformed Referer — not worth alerting on, just drop it.
    return null;
  }
}

/**
 * True when `referrer` comes from the same origin as this app — used to
 * drop the owner's own preview visits from the pageview counter.
 * `appOrigin` should be the normalized `NEXT_PUBLIC_APP_URL` (no
 * trailing slash, same scheme/host).
 */
export function isSelfReferrer(
  referrer: string | null | undefined,
  appOrigin: string | null | undefined
): boolean {
  const sanitized = sanitizeReferrer(referrer);
  if (!sanitized || !appOrigin) return false;
  const normalizedApp = appOrigin.replace(/\/+$/, "");
  return sanitized === normalizedApp;
}

/**
 * Normalize a path to `/foo/bar` (always leading slash, no trailing
 * slash except for root, length-capped). Nulls become null.
 */
export function normalizePath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  let p = path.trim();
  if (p.length === 0) return null;
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  // Cap at 2KB so a pathological query string can't blow a row up.
  return p.slice(0, 2048);
}
