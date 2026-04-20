/**
 * Phase 6 — Dynamic OG image endpoint.
 *
 * GET /api/og?portfolioId=X[&projectId=Y][&v=<hash>]
 *   → 200 image/png   1200×630 social-card image
 *   → 400             missing/invalid portfolioId
 *   → 404             portfolio not found
 *
 * Cache posture:
 *   Cache-Control: public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800
 *
 * The `v` query param is ignored server-side — it's just a cache-buster
 * the generator appends when content changes (e.g., profileDataHash).
 * Append any value; every distinct `v` is cached independently by edge.
 *
 * Fonts are lazy-loaded from `public/og-fonts/`. Missing files fall back
 * to `@vercel/og`'s built-in system fonts — still renders, just less
 * branded. See `public/og-fonts/README.md` for the one-time setup.
 *
 * Requires Node runtime (Drizzle + `fs.readFileSync`).
 */

import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { PortfolioOgLayout } from "@/lib/og/layout-portfolio";
import { ProjectOgLayout } from "@/lib/og/layout-project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADER =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

// ─── Font loading (module-scoped, best-effort) ─────────────────────────────

interface LoadedFont {
  name: "Inter";
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

/**
 * Read fonts from `public/og-fonts/`. We return only what's present —
 * the caller falls through to Satori defaults when the list is empty.
 * Evaluated once per module load (serverless instance lifetime).
 */
function loadFonts(): LoadedFont[] {
  const dir = path.join(process.cwd(), "public", "og-fonts");
  const wanted: Array<{ file: string; weight: 400 | 600 | 700 }> = [
    { file: "inter-regular.ttf", weight: 400 },
    { file: "inter-semibold.ttf", weight: 600 },
    { file: "inter-bold.ttf", weight: 700 },
  ];
  const out: LoadedFont[] = [];
  for (const { file, weight } of wanted) {
    try {
      const buf = readFileSync(path.join(dir, file));
      // Slice into a plain ArrayBuffer (not SharedArrayBuffer).
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength
      ) as ArrayBuffer;
      out.push({ name: "Inter", data: ab, weight, style: "normal" });
    } catch {
      // Missing file — skip this weight silently.
    }
  }
  return out;
}

const FONTS = loadFonts();

// ─── Data loaders ───────────────────────────────────────────────────────────

async function loadPortfolioData(portfolioId: string) {
  const [row] = await db
    .select({
      id: portfolios.id,
      name: portfolios.name,
      profileData: portfolios.profileData,
    })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!row) return null;

  const pd = (row.profileData as Record<string, unknown> | null) ?? {};
  const basics = (pd.basics as Record<string, unknown> | undefined) ?? {};
  const skillsArr = Array.isArray(pd.skills)
    ? (pd.skills as Array<{ name?: unknown }>)
    : [];

  return {
    name:
      (typeof basics.name === "string" && basics.name.trim()) ||
      row.name ||
      "Portfolio",
    label:
      typeof basics.label === "string" ? basics.label : null,
    summary:
      typeof basics.summary === "string" ? basics.summary : null,
    avatarUrl:
      typeof basics.avatar === "string" ? basics.avatar : null,
    topSkills: skillsArr
      .map((s) => (typeof s.name === "string" ? s.name : ""))
      .filter((n) => n.length > 0)
      .slice(0, 3),
  };
}

async function loadProjectData(portfolioId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.portfolioId !== portfolioId) return null;

  const name =
    (row.displayName && row.displayName.trim()) ||
    (row.repoName && row.repoName.trim()) ||
    "Project";

  let description: string | null = null;
  if (row.manualDescription?.trim()) {
    description = row.manualDescription.trim();
  } else {
    const meta = row.repoMetadata as Record<string, unknown> | null;
    if (meta && typeof meta.description === "string") {
      description = meta.description.trim() || null;
    }
  }

  const stack = Array.isArray(row.techStack)
    ? (row.techStack as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 5)
    : [];

  return { name, description, techStack: stack };
}

// ─── Handler ────────────────────────────────────────────────────────────────

function errorPng(status: number, body: string): Response {
  // Bots handle text/plain fine when the image can't be produced.
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Still cache short-term to avoid hammering on bad URLs.
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const projectId = searchParams.get("projectId");

  if (!portfolioId) return errorPng(400, "portfolioId is required");

  const portfolioData = await loadPortfolioData(portfolioId);
  if (!portfolioData) return errorPng(404, "Portfolio not found");

  let element: React.ReactElement;
  if (projectId) {
    const project = await loadProjectData(portfolioId, projectId);
    if (!project) return errorPng(404, "Project not found");
    element = ProjectOgLayout({
      ownerName: portfolioData.name,
      projectName: project.name,
      description: project.description,
      techStack: project.techStack,
    });
  } else {
    element = PortfolioOgLayout(portfolioData);
  }

  try {
    const image = new ImageResponse(element, {
      width: 1200,
      height: 630,
      fonts: FONTS.length > 0 ? FONTS : undefined,
      headers: { "Cache-Control": CACHE_HEADER },
    });
    return image;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/og] render failed:", err);
    return errorPng(500, "Image render failed");
  }
}
