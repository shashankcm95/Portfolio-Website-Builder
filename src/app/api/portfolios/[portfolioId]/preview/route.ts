import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
    } else {
      filePath = `${page}/index.html`;
    }

    const content = files.get(filePath);
    if (!content) {
      return new NextResponse(
        `<html><body><h1>Page not found</h1><p>Available pages: ${Array.from(files.keys()).join(", ")}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const contentType = filePath.endsWith(".css") ? "text/css" : "text/html";

    return new NextResponse(content, {
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
