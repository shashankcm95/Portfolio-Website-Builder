/**
 * Phase 7 — Tier 1 (static) layout review rules.
 *
 * Parses each rendered HTML page with cheerio and emits LayoutIssue[]
 * for catchable problems. Cheap, deterministic, no browser needed.
 * Runs everywhere (Vercel serverless, self-host, Docker).
 *
 * Rule catalog (matches the plan's table):
 *   R1  — every <img> has alt text
 *   R2  — exactly one <h1> per page
 *   R3  — heading hierarchy doesn't skip levels
 *   R4  — <title> present, 10-60 chars
 *   R5  — <meta name="description"> present, 50-160 chars
 *   R6  — <html lang> set
 *   R7  — internal links resolve to a known page
 *   R8  — analytics / chatbot script tags carry valid src URLs (no
 *         literal "undefined" leaking through)
 */

import * as cheerio from "cheerio";
import type { LayoutIssue } from "./types";

/**
 * Run all static checks across every HTML page in the generator's
 * output map. Skips non-HTML entries (CSS, sitemap.xml, robots.txt).
 */
export function runStaticChecks(files: Map<string, string>): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  // Collect the full set of valid asset paths (as they'd appear in href)
  // so R7 can resolve internal links. The generator emits keys like
  // `index.html`, `about/index.html`, `projects/foo/index.html`. We
  // translate them to the URL paths used in templates: `/`,
  // `/about/`, `/projects/foo/`.
  const validPaths = new Set<string>(["/"]);
  for (const key of files.keys()) {
    if (key.endsWith("/index.html")) {
      validPaths.add("/" + key.slice(0, -"index.html".length));
    } else if (key === "index.html") {
      validPaths.add("/");
    } else {
      // styles/global.css, sitemap.xml, robots.txt
      validPaths.add("/" + key);
    }
  }

  for (const [filePath, html] of files.entries()) {
    if (!filePath.endsWith(".html")) continue;
    const pageKey = pageKeyFromPath(filePath);
    issues.push(...runChecksForPage(html, pageKey, validPaths));
  }

  return issues;
}

// ─── Internal: per-page checks ──────────────────────────────────────────────

function runChecksForPage(
  html: string,
  page: string,
  validPaths: Set<string>
): LayoutIssue[] {
  const $ = cheerio.load(html);
  const out: LayoutIssue[] = [];

  // R1 — every <img> has alt
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    const role = $(el).attr("role");
    if (role === "presentation" || role === "none") return;
    if (alt === undefined || alt === null) {
      out.push({
        rule: "R1-img-missing-alt",
        tier: "static",
        severity: "warning",
        message: "Image is missing an alt attribute. Add a description or role=\"presentation\" if decorative.",
        page,
        elementSelector: describeImg($, el),
      });
    }
  });

  // R2 — exactly one <h1>
  const h1Count = $("h1").length;
  if (h1Count === 0) {
    out.push({
      rule: "R2-no-h1",
      tier: "static",
      severity: "warning",
      message: "Page has no <h1>. Search engines and screen readers expect one.",
      page,
    });
  } else if (h1Count > 1) {
    out.push({
      rule: "R2-multiple-h1",
      tier: "static",
      severity: "warning",
      message: `Page has ${h1Count} <h1> elements. Use exactly one for the page title.`,
      page,
      details: { count: h1Count },
    });
  }

  // R3 — heading hierarchy monotonic (no skipped levels). Walk in DOM order.
  let prevLevel: number | null = null;
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName.slice(1), 10);
    if (prevLevel !== null && level > prevLevel + 1) {
      out.push({
        rule: "R3-heading-skip",
        tier: "static",
        severity: "info",
        message: `Heading jumps from h${prevLevel} to h${level} — consider an intermediate level for screen readers.`,
        page,
        details: { from: prevLevel, to: level },
      });
    }
    prevLevel = level;
  });

  // R4 — <title> present, 10-60 chars
  const titleText = $("title").text().trim();
  if (!titleText) {
    out.push({
      rule: "R4-title-missing",
      tier: "static",
      severity: "critical",
      message: "Page has no <title> tag.",
      page,
    });
  } else if (titleText.length < 10) {
    out.push({
      rule: "R4-title-short",
      tier: "static",
      severity: "warning",
      message: `Page <title> is ${titleText.length} chars. Aim for 10-60.`,
      page,
      details: { actual: titleText.length, min: 10, max: 60 },
    });
  } else if (titleText.length > 60) {
    out.push({
      rule: "R4-title-long",
      tier: "static",
      severity: "warning",
      message: `Page <title> is ${titleText.length} chars. Search results truncate around 60.`,
      page,
      details: { actual: titleText.length, min: 10, max: 60 },
    });
  }

  // R5 — meta description present, 50-160 chars
  const desc = ($('meta[name="description"]').attr("content") ?? "").trim();
  if (!desc) {
    out.push({
      rule: "R5-meta-description-missing",
      tier: "static",
      severity: "warning",
      message: 'Page has no <meta name="description">.',
      page,
    });
  } else if (desc.length < 50) {
    out.push({
      rule: "R5-meta-description-short",
      tier: "static",
      severity: "info",
      message: `Meta description is ${desc.length} chars. Aim for 50-160 for richer search snippets.`,
      page,
      details: { actual: desc.length },
    });
  } else if (desc.length > 160) {
    out.push({
      rule: "R5-meta-description-long",
      tier: "static",
      severity: "info",
      message: `Meta description is ${desc.length} chars. Search engines truncate around 160.`,
      page,
      details: { actual: desc.length },
    });
  }

  // R6 — <html lang> set
  const lang = $("html").attr("lang");
  if (!lang) {
    out.push({
      rule: "R6-html-lang-missing",
      tier: "static",
      severity: "warning",
      message: 'The <html> tag has no lang attribute. Set it (e.g. lang="en") for accessibility.',
      page,
    });
  }

  // R7 — internal links resolve. Skip mailto:, tel:, external (http(s)://...
  // not pointing at our own host) and hash anchors.
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("//")
    ) {
      return;
    }
    // Strip query / hash; ensure trailing slash for directory paths.
    const path = href.split("#")[0].split("?")[0];
    if (!validPaths.has(path) && !validPaths.has(path.replace(/\/?$/, "/"))) {
      out.push({
        rule: "R7-internal-link-broken",
        tier: "static",
        severity: "critical",
        message: `Internal link "${href}" doesn't match any generated page.`,
        page,
        details: { href, path },
      });
    }
  });

  // R8 — script src must not be the literal string "undefined"
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (src.includes("undefined") || src.endsWith("/undefined")) {
      out.push({
        rule: "R8-script-undefined-src",
        tier: "static",
        severity: "critical",
        message: `<script> src looks broken: "${src}". Likely a missing env var (NEXT_PUBLIC_APP_URL?).`,
        page,
        details: { src },
      });
    }
  });

  // R8b — chatbot embed data attribute present when script tag is.
  $("script[data-portfolio-id]").each((_, el) => {
    const id = $(el).attr("data-portfolio-id") ?? "";
    if (!id || id === "undefined" || id === "null") {
      out.push({
        rule: "R8-chatbot-embed-id",
        tier: "static",
        severity: "critical",
        message: `Chatbot embed has invalid data-portfolio-id="${id}".`,
        page,
        details: { id },
      });
    }
  });

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map output filePath → page key used in LayoutIssue.page. */
function pageKeyFromPath(filePath: string): string {
  if (filePath === "index.html") return "index";
  if (filePath.endsWith("/index.html")) {
    return filePath.slice(0, -"/index.html".length);
  }
  return filePath;
}

/**
 * Stringify an <img> for CSS-selector reporting (best effort). The
 * `el` type is `unknown` because cheerio v1's typings have churned;
 * we cast inside via `$(el)` which accepts anything.
 */
function describeImg($: cheerio.CheerioAPI, el: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $el = $(el as any);
  const id = $el.attr("id");
  if (id) return `img#${id}`;
  const cls = $el.attr("class");
  if (cls) return `img.${cls.split(/\s+/)[0]}`;
  const src = $el.attr("src") ?? "";
  return `img[src="${src.slice(0, 40)}${src.length > 40 ? "…" : ""}"]`;
}
