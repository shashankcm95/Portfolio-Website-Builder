/**
 * Phase 6 — Generator-side sitemap.xml + robots.txt emitters.
 *
 * These files live in the generator's output Map alongside `index.html`
 * etc., so Cloudflare Pages serves them as static assets on the
 * published site. Absolute URLs require the published `siteUrl`; when
 * that's unknown at render time we emit path-only URLs (browsers
 * resolve them relative to the host), which is valid-but-not-ideal
 * sitemap XML. Most crawlers accept it.
 */

import type { ProfileData } from "@/templates/_shared/types";

// ─── Project slug helper (mirrors renderer.generateProjectSlug) ────────────

function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "project";
}

// ─── URL builder that handles relative + absolute cleanly ───────────────────

function buildUrl(siteUrl: string, pathname: string): string {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!siteUrl) return clean;
  return `${siteUrl.replace(/\/+$/, "")}${clean}`;
}

// ─── sitemap.xml ────────────────────────────────────────────────────────────

/**
 * Generate a sitemap.xml for the published site. Includes the home,
 * about, projects index, contact, and one entry per visible project.
 */
export function generateSitemap(profileData: ProfileData): string {
  const siteUrl = profileData.meta.siteUrl || "";
  const lastmod = profileData.meta.generatedAt
    ? profileData.meta.generatedAt.slice(0, 10) // YYYY-MM-DD
    : undefined;

  const entries: Array<{ loc: string; priority: number }> = [
    { loc: buildUrl(siteUrl, "/"), priority: 1.0 },
    { loc: buildUrl(siteUrl, "/about/"), priority: 0.7 },
    { loc: buildUrl(siteUrl, "/projects/"), priority: 0.8 },
    { loc: buildUrl(siteUrl, "/contact/"), priority: 0.5 },
  ];
  for (const p of profileData.projects) {
    entries.push({
      loc: buildUrl(siteUrl, `/projects/${projectSlug(p.name)}/`),
      priority: 0.9,
    });
  }

  const body = entries
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${escapeXml(e.loc)}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
        `    <priority>${e.priority.toFixed(1)}</priority>\n` +
        `  </url>`
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n` +
    `</urlset>\n`
  );
}

// ─── robots.txt ─────────────────────────────────────────────────────────────

/**
 * robots.txt for the published site. Permits all user-agents; points
 * at the sitemap when siteUrl is known. No disallow rules — the site
 * is a professional portfolio, crawling is desirable.
 */
export function generateRobotsTxt(profileData: ProfileData): string {
  const siteUrl = profileData.meta.siteUrl || "";
  const lines = ["User-agent: *", "Allow: /"];
  if (siteUrl) {
    lines.push(`Sitemap: ${siteUrl.replace(/\/+$/, "")}/sitemap.xml`);
  }
  return lines.join("\n") + "\n";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal XML-entity escape for URL strings. Sitemaps reject `& < >` raw. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
