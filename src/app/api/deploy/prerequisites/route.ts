/**
 * Phase 10, Track B — Deploy pre-flight check.
 *
 * GET /api/deploy/prerequisites
 *
 * Returns whether the platform has Cloudflare credentials configured. The
 * deploy button uses this to hide itself and show a connect-your-credentials
 * explainer before the user wastes a click. Does NOT hit the Cloudflare API
 * — just checks environment variables are present + non-empty.
 *
 * Phase R7 — also rejects the literal `.env.example` placeholder values.
 * Without this, a fresh clone where the user copied `.env.example` to
 * `.env.local` without editing the Cloudflare lines passes the
 * `Boolean(accountId)` truthiness check, the deploy button shows itself,
 * the user clicks it, and wrangler fails with a confusing 7003 error
 * referencing `your-cloudflare-account-id` literally in the URL.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Values that look configured but are actually `.env.example` placeholders.
 * Treated as "not configured" so the deploy CTA stays hidden.
 */
const PLACEHOLDER_VALUES = new Set([
  "your-cloudflare-account-id",
  "your-cloudflare-api-token",
  "your_cloudflare_account_id",
  "your_cloudflare_api_token",
  "<your-cloudflare-account-id>",
  "<your-cloudflare-api-token>",
  "changeme",
  "example",
  "placeholder",
]);

function isRealValue(v: string | undefined): v is string {
  if (!v) return false;
  const trimmed = v.trim();
  if (trimmed.length === 0) return false;
  return !PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  const accountIdReal = isRealValue(accountId);
  const apiTokenReal = isRealValue(apiToken);
  const cloudflareConfigured = accountIdReal && apiTokenReal;

  if (cloudflareConfigured) {
    return NextResponse.json({ cloudflareConfigured: true });
  }

  const missing: string[] = [];
  if (!accountIdReal) {
    missing.push(
      accountId
        ? "CLOUDFLARE_ACCOUNT_ID (looks like the .env.example placeholder)"
        : "CLOUDFLARE_ACCOUNT_ID"
    );
  }
  if (!apiTokenReal) {
    missing.push(
      apiToken
        ? "CLOUDFLARE_API_TOKEN (looks like the .env.example placeholder)"
        : "CLOUDFLARE_API_TOKEN"
    );
  }

  return NextResponse.json({
    cloudflareConfigured: false,
    reason: `Missing or placeholder env var${
      missing.length === 1 ? "" : "s"
    }: ${missing.join(", ")}`,
  });
}
