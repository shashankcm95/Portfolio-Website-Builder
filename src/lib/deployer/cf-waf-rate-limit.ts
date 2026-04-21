/**
 * Phase 9 — Best-effort WAF rate-limit rule provisioner.
 *
 * When a portfolio is published with `selfHostedChatbot: true`, we drop
 * a Cloudflare WAF rate-limit rule against `/api/chat/*` so the Pages
 * Function can't be trivially DoS'd. A blanket ~20 requests/60s per IP
 * is the MVP defense; per-visitor fine-grained limits defer to a later
 * phase (Durable Objects territory).
 *
 * Every call is best-effort — the deploy succeeds even when rule
 * provisioning fails (insufficient token scopes, account on a plan
 * without WAF rate-limit, beta API drift). Failures return a structured
 * result the caller logs + surfaces as a dashboard notice.
 *
 * Cloudflare API ref:
 *   https://developers.cloudflare.com/api/resources/rate_limits/
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";

export interface ProvisionResult {
  ok: boolean;
  /** Present on success — the id the provider returned. Useful for later deletes. */
  ruleId?: string;
  /** Present on failure — short, user-facing reason. */
  reason?: string;
}

/** Tunable blanket cap for the MVP. Per-visitor limits defer. */
export const RATE_LIMIT = {
  /** Requests allowed per window per IP. */
  requests: 20,
  /** Window size, seconds. */
  period: 60,
  /** Block duration after limit exceeded, seconds. */
  mitigationTimeout: 60,
} as const;

/**
 * Provision the rate-limit rule for a Pages project.
 *
 * The Pages project's zone id isn't always queryable directly; we take
 * the deploy URL the caller already has and resolve the zone from its
 * hostname. When that resolution fails (e.g. `*.pages.dev` isn't a
 * user-owned zone and Cloudflare doesn't expose WAF-rate-limit on it),
 * we return `ok: false` with the reason.
 *
 * Callers:
 *   - `src/lib/deployer/cloudflare.ts` — after `wrangler pages deploy`
 *     returns a success + URL.
 *
 * Not idempotent yet: re-publishing creates a new rule per deploy.
 * Deduplication (look up by description prefix, update-or-create) is a
 * follow-up once we see it in practice.
 */
export async function provisionChatRateLimit(args: {
  deployUrl: string;
  pagesProjectName: string;
}): Promise<ProvisionResult> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return {
      ok: false,
      reason:
        "CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN not set — skipping rate-limit provisioning.",
    };
  }

  // 1. Resolve hostname → zone id. Most user-owned portfolios use a
  //    custom domain; `*.pages.dev` is a Cloudflare-owned zone and
  //    the WAF API rejects rule creation there (we note that reason
  //    back to the caller without treating it as a failure).
  let hostname: string;
  try {
    hostname = new URL(args.deployUrl).hostname;
  } catch {
    return { ok: false, reason: `Invalid deployUrl: ${args.deployUrl}` };
  }

  if (hostname.endsWith(".pages.dev") || hostname.endsWith(".workers.dev")) {
    return {
      ok: false,
      reason:
        "Pages-default subdomain (*.pages.dev) has no user-owned zone — " +
        "add a custom domain to enable WAF rate-limiting on /api/chat/*.",
    };
  }

  const zoneId = await lookupZoneIdForHost(hostname);
  if (!zoneId) {
    return {
      ok: false,
      reason: `Could not resolve Cloudflare zone for ${hostname}.`,
    };
  }

  // 2. POST the rule. Cloudflare's legacy rate-limit API is v4 rest;
  //    the newer Rulesets API uses a different shape. We use the legacy
  //    endpoint because it's available on Free plan.
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/rate_limits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disabled: false,
          description: `phase9-chatbot-${args.pagesProjectName}`,
          match: {
            request: {
              methods: ["POST"],
              schemes: ["HTTPS"],
              url: `${hostname}/api/chat/*`,
            },
          },
          threshold: RATE_LIMIT.requests,
          period: RATE_LIMIT.period,
          action: {
            mode: "simulate", // Start in simulate mode; owner can promote to "ban".
            timeout: RATE_LIMIT.mitigationTimeout,
            response: {
              content_type: "application/json",
              body: JSON.stringify({
                error: "Too many requests",
                code: "rate_limited",
                retryAfterMs: RATE_LIMIT.mitigationTimeout * 1000,
              }),
            },
          },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `rate_limits API ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as {
      success?: boolean;
      result?: { id?: string };
    };
    if (!json.success || !json.result?.id) {
      return { ok: false, reason: "rate_limits API returned success=false" };
    }
    return { ok: true, ruleId: json.result.id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * List zones the token owns + find the one whose name matches (or is
 * an apex ancestor of) the hostname. Returns null when none match.
 */
async function lookupZoneIdForHost(hostname: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones?per_page=50`,
      {
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      result?: Array<{ id: string; name: string }>;
    };
    if (!json.success || !Array.isArray(json.result)) return null;

    // Prefer the longest matching suffix — `foo.example.com` picks the
    // `example.com` zone, not an unrelated `com`-owned one.
    let best: { id: string; name: string } | null = null;
    for (const z of json.result) {
      if (hostname === z.name || hostname.endsWith(`.${z.name}`)) {
        if (!best || z.name.length > best.name.length) best = z;
      }
    }
    return best?.id ?? null;
  } catch {
    return null;
  }
}
