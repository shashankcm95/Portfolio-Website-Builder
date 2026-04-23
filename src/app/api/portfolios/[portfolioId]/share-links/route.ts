/**
 * Phase 6 — Owner-facing share-links management.
 *
 * GET  /api/portfolios/:portfolioId/share-links
 *   → 200 { links: ShareTokenSummary[] }   active + revoked, newest first
 *
 * POST /api/portfolios/:portfolioId/share-links
 *   body: { label?: string; expiresIn?: "24h" | "7d" | "30d" | null }
 *   → 201 { link: ShareTokenSummary, url: string }
 *
 * Both are owner-auth-gated via `auth()` + ownership check. Collision
 * on the unique `token` index is theoretically possible (120 bits of
 * entropy → ~1e-20) so we try once then fall through to the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shareTokens } from "@/lib/db/schema";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";
import { getAppUrl } from "@/lib/env/app-url";
import { generateShareToken } from "@/lib/share/tokens";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Body shape ─────────────────────────────────────────────────────────────

type ExpiryWindow = "24h" | "7d" | "30d";

const EXPIRY_WINDOWS: Record<ExpiryWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Max label length — keeps the UI predictable, prevents 200KB labels. */
const MAX_LABEL_CHARS = 80;

interface ParsedBody {
  label: string | null;
  expiresAt: Date | null;
}

function parseBody(raw: unknown): ParsedBody | string {
  if (raw && typeof raw !== "object") return "Body must be an object";
  const b = (raw ?? {}) as Record<string, unknown>;

  let label: string | null = null;
  if (b.label != null) {
    if (typeof b.label !== "string") return "label must be a string";
    const trimmed = b.label.trim();
    if (trimmed.length > MAX_LABEL_CHARS) {
      return `label exceeds ${MAX_LABEL_CHARS} characters`;
    }
    label = trimmed.length > 0 ? trimmed : null;
  }

  let expiresAt: Date | null = null;
  if (b.expiresIn != null) {
    if (typeof b.expiresIn !== "string")
      return "expiresIn must be a string";
    if (b.expiresIn === "never") {
      expiresAt = null;
    } else if (b.expiresIn in EXPIRY_WINDOWS) {
      expiresAt = new Date(Date.now() + EXPIRY_WINDOWS[b.expiresIn as ExpiryWindow]);
    } else {
      return `expiresIn must be one of: never, ${Object.keys(EXPIRY_WINDOWS).join(", ")}`;
    }
  }

  return { label, expiresAt };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function baseAppUrl(req: NextRequest): string {
  const env = getAppUrl();
  if (env) return env;
  // Fallback: reconstruct from the request. Host + protocol on x-forwarded-*.
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function toSummary(row: typeof shareTokens.$inferSelect) {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

// ─── GET — list ─────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  // Naturally bounded: per-portfolio share tokens are owner-created and
  // the UI caps creation rate; unbounded growth requires deliberate abuse
  // from the owner against their own portfolio.
  const rows = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.portfolioId, params.portfolioId))
    .orderBy(desc(shareTokens.createdAt));

  return NextResponse.json({ links: rows.map(toSummary) });
}

// ─── POST — create ──────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authResult = await authorizePortfolio(params.portfolioId);
  if (authResult.error) return authResult.error;

  let raw: unknown = {};
  try {
    // Allow empty body — clients that just want defaults send nothing.
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = parseBody(raw);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const token = generateShareToken();
  const [inserted] = await db
    .insert(shareTokens)
    .values({
      portfolioId: params.portfolioId,
      token,
      label: parsed.label,
      expiresAt: parsed.expiresAt,
    })
    .returning();

  // Use the DB-returned token — guarantees the URL matches the row
  // even if (implausibly) a collision forced a retry layer in the future.
  const url = `${baseAppUrl(req)}/share/${inserted.token}`;
  return NextResponse.json(
    { link: toSummary(inserted), url },
    { status: 201 }
  );
}
