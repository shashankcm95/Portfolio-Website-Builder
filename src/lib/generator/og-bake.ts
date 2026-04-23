/**
 * Phase 8.5 — Static OG-image bake at generation time.
 *
 * Produces the 1200×630 social card PNG used by the published portfolio's
 * `<meta property="og:image">` tag. Writing the image into the deploy
 * (at `og.png`) decouples the generated site from the builder — social
 * scrapers fetch the card from the same origin as the portfolio HTML
 * instead of hitting `{APP_URL}/api/og` on the builder.
 *
 * Mirrors the rendering path in `src/app/api/og/route.ts` so the image
 * shape is identical between the live route (used by preview flows) and
 * the baked file. Best-effort: any failure returns `null` and the caller
 * omits the meta tag, letting the template fall through to `basics.avatar`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "@vercel/og";
import { PortfolioOgLayout } from "@/lib/og/layout-portfolio";
import type { ProfileData } from "@/templates/_shared/types";

// Matches the edge-route constraint: 1200×630 is the canonical OG card.
const WIDTH = 1200;
const HEIGHT = 630;

interface LoadedFont {
  name: "Inter";
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

/**
 * Same font-load pattern as the edge route; cached at module load. Fonts
 * missing from disk are silently skipped — Satori falls back to its
 * bundled defaults so the render still produces a non-empty PNG.
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
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength
      ) as ArrayBuffer;
      out.push({ name: "Inter", data: ab, weight, style: "normal" });
    } catch {
      // Font asset missing on disk — skip this weight; @vercel/og
      // falls back to a system font for missing weights.
    }
  }
  return out;
}

const FONTS = loadFonts();

/**
 * Render the portfolio's OG image to a PNG buffer.
 *
 * Best-effort — any @vercel/og / Satori failure is caught and surfaced as
 * `null`. Callers must treat a null return as "don't emit the file; omit
 * the meta tag" rather than as a generation-blocking error.
 *
 * The caller supplies a fully-assembled `ProfileData` (typically just
 * before `renderTemplate`), so we don't have to round-trip the DB here.
 */
export async function bakePortfolioOgImage(
  profile: ProfileData
): Promise<Buffer | null> {
  try {
    const element = PortfolioOgLayout({
      name: profile.basics.name,
      label: profile.basics.label ?? null,
      summary: profile.basics.summary ?? null,
      avatarUrl: profile.basics.avatar ?? null,
      topSkills: profile.skills.slice(0, 3).map((s) => s.name),
    });

    const response = new ImageResponse(element, {
      width: WIDTH,
      height: HEIGHT,
      fonts: FONTS.length > 0 ? FONTS : undefined,
    });

    // `ImageResponse` extends the Fetch `Response`. In Node mode we drain
    // it into a Buffer so the caller can write it to the output map /
    // upload it to Cloudflare Pages / etc.
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    // Don't blow up the whole generation for a cosmetic artifact.
    // eslint-disable-next-line no-console
    console.warn(
      "[og-bake] portfolio OG image render failed; falling back to avatar:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
