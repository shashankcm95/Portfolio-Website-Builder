/**
 * Phase 10, Track B — Deploy pre-flight check.
 *
 * GET /api/deploy/prerequisites
 *
 * Returns whether the platform has Cloudflare credentials configured. The
 * deploy button uses this to hide itself and show a connect-your-credentials
 * explainer before the user wastes a click. Does NOT hit the Cloudflare API
 * — just checks environment variables are present + non-empty.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  const cloudflareConfigured = Boolean(accountId) && Boolean(apiToken);

  if (cloudflareConfigured) {
    return NextResponse.json({ cloudflareConfigured: true });
  }

  const missing: string[] = [];
  if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!apiToken) missing.push("CLOUDFLARE_API_TOKEN");

  return NextResponse.json({
    cloudflareConfigured: false,
    reason: `Missing env var${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
  });
}
