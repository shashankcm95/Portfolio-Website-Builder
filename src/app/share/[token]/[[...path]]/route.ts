/**
 * Phase 6 — Public share-preview route handler.
 *
 * Catch-all GET under `/share/[token]/[[...path]]`:
 *   - `/share/abc…`                → `index.html`
 *   - `/share/abc…/about`          → `about/index.html`
 *   - `/share/abc…/projects/x`     → `projects/x/index.html`
 *   - `/share/abc…/styles/global.css` → inlined CSS as `text/css`
 *
 * Route handler (not a page component) because we need to:
 *   - serve multiple MIME types from one path (HTML + CSS + future assets),
 *   - return pre-rendered strings directly (no JSX wrapping),
 *   - bypass any layout chrome from the app shell.
 *
 * Middleware marks `/share/*` public. `public/robots.txt` blocks crawl.
 *
 * Behavior:
 *   - Token shape validated before any DB hit.
 *   - 404 on unknown / expired / revoked tokens.
 *   - 404 on unmatched sub-paths.
 *   - Each successful render fire-and-forgets a `viewCount` + `lastViewedAt`
 *     bump. Non-fatal on failure.
 *   - Chatbot embed is deliberately suppressed on share previews (plan §8).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shareTokens } from "@/lib/db/schema";
import { assembleProfileData } from "@/lib/generator/profile-data";
import { renderTemplate } from "@/lib/generator/renderer";
import { isValidShareTokenShape } from "@/lib/share/tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { token: string; path?: string[] };

function resolveOutputKey(pathSegments: string[] | undefined): string {
  const parts = (pathSegments ?? []).filter((s) => s.length > 0);
  if (parts.length === 0) return "index.html";
  const joined = parts.join("/");
  // Phase 8.5 — binary/static assets pass through as-is.
  if (
    joined.endsWith(".css") ||
    joined.endsWith(".js") ||
    joined.endsWith(".png") ||
    joined.endsWith(".xml") ||
    joined.endsWith(".txt")
  ) {
    return joined;
  }
  return `${joined.replace(/\/+$/, "")}/index.html`;
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".css")) return "text/css; charset=utf-8";
  if (key.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (key.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "text/html; charset=utf-8";
}

async function bumpViewCount(tokenRowId: string): Promise<void> {
  try {
    await db
      .update(shareTokens)
      .set({
        viewCount: sql`${shareTokens.viewCount} + 1`,
        lastViewedAt: new Date(),
      })
      .where(eq(shareTokens.id, tokenRowId));
  } catch {
    // Non-fatal — counters shouldn't break rendering.
  }
}

function notFound(): Response {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: RouteParams }
) {
  if (!isValidShareTokenShape(params.token)) return notFound();

  const now = new Date();
  const [row] = await db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, params.token),
        isNull(shareTokens.revokedAt),
        or(
          isNull(shareTokens.expiresAt),
          gt(shareTokens.expiresAt, now)
        )
      )
    )
    .limit(1);

  if (!row) return notFound();

  // Render via the generator pipeline.
  let profileData;
  try {
    profileData = await assembleProfileData(row.portfolioId);
  } catch {
    return notFound();
  }

  // Plan §8 — disable the chatbot widget on shared previews.
  if (profileData.chatbot) profileData.chatbot = undefined;

  const files = await renderTemplate(
    profileData.meta.templateId || "minimal",
    profileData
  );

  const key = resolveOutputKey(params.path);
  const content = files.get(key);
  if (content === undefined) return notFound();

  bumpViewCount(row.id); // fire-and-forget

  const ct = contentTypeFor(key);

  // Phase 8.5 — binary files (baked og.png Buffer) serve raw; HTML gets the
  // noindex injection; other text files pass through.
  if (Buffer.isBuffer(content)) {
    return new Response(content as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "X-Share-Preview": "1",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  // For HTML, inject a noindex meta directly after <head> as belt-and-
  // suspenders alongside public/robots.txt.
  const body = ct.startsWith("text/html")
    ? content.replace(
        /<head>/i,
        `<head><meta name="robots" content="noindex,nofollow" />`
      )
    : content;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "X-Share-Preview": "1",
      // Previews must reflect the latest draft state — no caching.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
