import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, params.portfolioId),
        eq(portfolios.userId, session.user.id)
      )
    )
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { assembleProfileData } = await import("@/lib/generator/profile-data");
    const { renderTemplate } = await import("@/lib/generator/renderer");

    const profileData = await assembleProfileData(params.portfolioId);

    // Phase 7 — preview-only override of the stored template. Lets the
    // template picker show "Preview this template" without a save round-trip.
    // Always falls back to the stored templateId.
    const { searchParams } = new URL(req.url);
    const templateOverride = searchParams.get("templateId");
    const ALLOWED_TEMPLATES = new Set([
      "minimal",
      "classic",
      "research",
      "terminal",
      "editorial",
    ]);
    const templateId =
      templateOverride && ALLOWED_TEMPLATES.has(templateOverride)
        ? templateOverride
        : portfolio.templateId ?? "minimal";

    const files = await renderTemplate(templateId, profileData);

    // Determine which page to serve
    const page = searchParams.get("page") ?? "index";

    // Map page name to file path
    let filePath: string;
    if (page === "index" || page === "home") {
      filePath = "index.html";
    } else if (page === "styles/global.css") {
      filePath = "styles/global.css";
    } else if (page === "og.png") {
      filePath = "og.png";
    } else {
      filePath = `${page}/index.html`;
    }

    const content = files.get(filePath);
    if (content === undefined) {
      return new NextResponse(
        `<html><body><h1>Page not found</h1><p>Available pages: ${Array.from(files.keys()).join(", ")}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Phase 8.5 — the files map now carries either strings (HTML/CSS/XML)
    // or binary Buffers (baked og.png). Branch on shape so we don't
    // UTF-8-decode a PNG. The chatbot resize snippet + internal links
    // only apply to HTML; PNG/CSS pass through untouched.
    if (Buffer.isBuffer(content)) {
      const binaryContentType = filePath.endsWith(".png")
        ? "image/png"
        : "application/octet-stream";
      return new NextResponse(content as unknown as BodyInit, {
        headers: {
          "Content-Type": binaryContentType,
          "Cache-Control": "no-store",
        },
      });
    }

    const contentType = filePath.endsWith(".css") ? "text/css" : "text/html";

    // Rewrite internal nav links for the preview context so clicking
    // "About" inside the iframe stays inside the preview endpoint
    // instead of hitting the builder's app routes (which 404). Only
    // applied to HTML responses; CSS passes through untouched.
    const body =
      contentType === "text/html"
        ? rewritePreviewLinks(content, params.portfolioId, templateId)
        : content;

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Preview generation error:", error);
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem">
        <h1>Preview Error</h1>
        <p style="color:#666">Could not generate preview. Make sure you have at least one project with completed analysis.</p>
        <pre style="background:#f5f5f5;padding:1rem;border-radius:8px;overflow:auto">${error.message}</pre>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

/**
 * Rewrite internal `<a href>` attributes so the preview iframe's own
 * navigation stays inside the preview endpoint. The generator emits
 * absolute paths (`/about/`, `/projects/foo/`) because that's what the
 * published static site needs, but those paths don't exist on the
 * builder's Next.js app — they'd 404. We map each to the preview's
 * `?page=` convention.
 *
 * External links (http://, https://, mailto:, tel:, #anchor) pass
 * through unchanged.
 */
function rewritePreviewLinks(
  html: string,
  portfolioId: string,
  templateId: string
): string {
  const $ = cheerio.load(html, null, false);
  const base = `/api/portfolios/${portfolioId}/preview`;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const rewritten = rewriteHref(href, base, templateId);
    if (rewritten !== href) {
      $(el).attr("href", rewritten);
    }
  });

  return $.html();
}

function rewriteHref(
  href: string,
  base: string,
  templateId: string
): string {
  if (!href) return href;
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//")
  ) {
    return href;
  }

  // Normalize: strip leading "/" and trailing "/" for page-name lookup.
  // Keep "styles/global.css" as-is but without the leading slash.
  let path = href.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "" || path === "index.html") path = "index";
  else if (path === "styles/global.css") path = "styles/global.css";
  // Everything else (about, projects, projects/widget-api, contact) is
  // passed through as-is — the page resolver in GET() handles them.

  const qs = new URLSearchParams({ page: path });
  // Preserve the preview-only template override so links inside a
  // "Preview this template" session keep rendering that template.
  qs.set("templateId", templateId);
  return `${base}?${qs.toString()}`;
}
