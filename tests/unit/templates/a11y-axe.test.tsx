/**
 * @jest-environment jsdom
 *
 * Phase Q1 — Automated accessibility audit on every template's home
 * page using axe-core. Catches color-contrast / ARIA / heading-order
 * regressions at PR time so they don't reach the published site.
 *
 * Q1 Lighthouse audit on shashank-cm.dev surfaced two real
 * a11y violations in the terminal template (`.prompt` and
 * `.ls-perm` contrast 3.95:1 below the WCAG AA 4.5:1 threshold,
 * plus inline links with no underline / insufficient adjacent
 * contrast). Both fixed in templates/terminal/styles/global.css —
 * this test guards against re-introducing them by future
 * template work.
 *
 * Why home + about pages, not every page: most a11y rules are
 * structural (color, headings, ARIA, focus order). They surface
 * the same way on every page that uses the template. Two pages
 * is enough to cover hero + chrome + content layout.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import axe from "axe-core";
import type { ProfileData, Project } from "../../../templates/_shared/types";

import * as minimalLayout from "../../../templates/minimal/components/Layout";
import * as minimalIndex from "../../../templates/minimal/pages/index";
import * as minimalAbout from "../../../templates/minimal/pages/about";

import * as classicLayout from "../../../templates/classic/components/Layout";
import * as classicIndex from "../../../templates/classic/pages/index";
import * as classicAbout from "../../../templates/classic/pages/about";

import * as researchLayout from "../../../templates/research/components/Layout";
import * as researchIndex from "../../../templates/research/pages/index";
import * as researchAbout from "../../../templates/research/pages/about";

import * as terminalLayout from "../../../templates/terminal/components/Layout";
import * as terminalIndex from "../../../templates/terminal/pages/index";
import * as terminalAbout from "../../../templates/terminal/pages/about";

import * as editorialLayout from "../../../templates/editorial/components/Layout";
import * as editorialIndex from "../../../templates/editorial/pages/index";
import * as editorialAbout from "../../../templates/editorial/pages/about";

import * as signalLayout from "../../../templates/signal/components/Layout";
import * as signalIndex from "../../../templates/signal/pages/index";
import * as signalAbout from "../../../templates/signal/pages/about";

import * as studioLayout from "../../../templates/studio/components/Layout";
import * as studioIndex from "../../../templates/studio/pages/index";
import * as studioAbout from "../../../templates/studio/pages/about";

// ─── Fixture (same shape as snapshots.test.tsx but minimal) ────────────────

const fixtureProject: Project = {
  id: "proj-1",
  name: "Signal Forge",
  repoUrl: "https://github.com/acme/signal-forge",
  description: "A tool for crafting proof-backed portfolios.",
  techStack: ["TypeScript", "Next.js"],
  isFeatured: true,
  displayOrder: 0,
  sections: {
    summary: "Signal Forge assembles GitHub evidence into a portfolio.",
    architecture: "Edge-deployed static generator.",
  },
  metadata: {
    stars: 4200,
    forks: 312,
    language: "TypeScript",
    topics: ["portfolio"],
  },
  facts: [
    {
      claim: "Written in TypeScript",
      category: "tech_stack",
      evidenceRef: "package.json",
    },
  ],
};

const fixture: ProfileData = {
  meta: {
    generatedAt: "2026-01-01T00:00:00.000Z",
    templateId: "fixture",
    portfolioSlug: "jane-doe",
    siteUrl: "https://jane.example.test",
    ogImageUrl: "/og.png",
    analyticsEndpoint: null,
    analyticsPortfolioId: null,
  },
  basics: {
    name: "Jane Doe",
    label: "Senior Software Engineer",
    email: "jane@example.test",
    url: "https://github.com/janedoe",
    summary:
      "Jane builds accessible, pixel-perfect interfaces for large-scale products.",
    location: { city: "London", country: "UK" },
    avatar: "https://example.test/jane.jpg",
    profiles: [
      { network: "GitHub", username: "janedoe", url: "https://github.com/janedoe" },
    ],
    positioning: "I build accessible, pixel-perfect experiences for the web.",
    namedEmployers: ["Apple"],
    hiring: {
      status: "available",
      ctaText: "Let's work together",
      ctaHref: "mailto:jane@example.test",
    },
  },
  skills: [
    {
      name: "TypeScript",
      category: "language",
      evidence: [{ projectName: "Signal Forge", usage: "primary language" }],
    },
  ],
  projects: [fixtureProject],
  chatbot: undefined,
};

// ─── Per-template renderer (matches snapshots.test.tsx pattern) ────────────

function renderHomePage(bundles: {
  Layout: typeof minimalLayout.Layout;
  HomePage: typeof minimalIndex.HomePage;
}): string {
  return renderToStaticMarkup(
    React.createElement(bundles.Layout, {
      profileData: fixture,
      currentPage: "home",
      cssContent: "/* fixture */",
      children: React.createElement(bundles.HomePage, { profileData: fixture }),
    })
  );
}

function renderAboutPage(bundles: {
  Layout: typeof minimalLayout.Layout;
  AboutPage: typeof minimalAbout.AboutPage;
}): string {
  return renderToStaticMarkup(
    React.createElement(bundles.Layout, {
      profileData: fixture,
      currentPage: "about",
      cssContent: "/* fixture */",
      children: React.createElement(bundles.AboutPage, { profileData: fixture }),
    })
  );
}

const TEMPLATES = [
  { name: "minimal", layout: minimalLayout, index: minimalIndex, about: minimalAbout },
  { name: "classic", layout: classicLayout, index: classicIndex, about: classicAbout },
  { name: "research", layout: researchLayout, index: researchIndex, about: researchAbout },
  { name: "terminal", layout: terminalLayout, index: terminalIndex, about: terminalAbout },
  { name: "editorial", layout: editorialLayout, index: editorialIndex, about: editorialAbout },
  { name: "signal", layout: signalLayout, index: signalIndex, about: signalAbout },
  { name: "studio", layout: studioLayout, index: studioIndex, about: studioAbout },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Inline the template's CSS so axe can evaluate computed styles
 * (color-contrast checks need real CSS, not just className markup).
 * We read the file synchronously per-template at module load time —
 * jest's caching is fine for test runs.
 */
import * as fs from "node:fs";
import * as path from "node:path";

function readTemplateCss(templateName: string): string {
  const cssPath = path.join(
    process.cwd(),
    "templates",
    templateName,
    "styles",
    "global.css"
  );
  return fs.readFileSync(cssPath, "utf-8");
}

interface AxeResult {
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    nodes: Array<{ html: string; failureSummary?: string }>;
  }>;
}

async function runAxe(
  rawHtml: string,
  templateName: string
): Promise<AxeResult> {
  // Inject the template CSS into the document so axe's contrast
  // check resolves the actual computed colors rather than seeing
  // unstyled defaults. We strip the `<style>` block already in the
  // rendered HTML (Layout inlines `cssContent`) and replace it with
  // the real CSS file.
  const css = readTemplateCss(templateName);
  const htmlWithCss = rawHtml.replace(
    /<style>[\s\S]*?<\/style>/,
    `<style>${css}</style>`
  );

  const dom = new JSDOM(htmlWithCss, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });

  // Inject axe.source into the JSDOM window so the engine runs
  // against the document. axe-core's `source` property is the
  // raw script text. Type assertion needed because @types/axe-core
  // doesn't expose `source` though it ships in the package.
  const axeSource = (axe as unknown as { source: string }).source;
  dom.window.eval(axeSource);

  // Run axe with the rules we care about for static page output:
  // contrast, ARIA, heading order, language. We deliberately disable
  // rules that depend on runtime behavior we can't simulate in
  // jsdom (focus-order-semantics needs real focus events, etc.).
  const winAny = dom.window as unknown as {
    axe: { run: (ctx: unknown, opts: unknown) => Promise<AxeResult> };
  };
  return winAny.axe.run(dom.window.document, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    // Off in jsdom: requires real layout / scrolling.
    rules: {
      "scrollable-region-focusable": { enabled: false },
      "frame-tested": { enabled: false },
    },
  });
}

function describeViolations(result: AxeResult): string {
  if (result.violations.length === 0) return "(no violations)";
  return result.violations
    .map((v) => {
      const examples = v.nodes
        .slice(0, 3)
        .map((n) => `    - ${n.html.slice(0, 200)}`)
        .join("\n");
      return `[${v.impact ?? "?"}] ${v.id}: ${v.description}\n${examples}`;
    })
    .join("\n\n");
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("axe accessibility audit — every template's home page", () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.name} home page has no WCAG AA violations`, async () => {
      const html = renderHomePage({
        Layout: tpl.layout.Layout,
        HomePage: tpl.index.HomePage,
      });
      const result = await runAxe(html, tpl.name);
      if (result.violations.length > 0) {
        // Print human-friendly output so the developer can copy the
        // failing selector straight into devtools.
        // eslint-disable-next-line no-console
        console.error(`\n${tpl.name} a11y violations:\n${describeViolations(result)}`);
      }
      expect(result.violations).toEqual([]);
    });
  }
});

describe("axe accessibility audit — every template's about page", () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.name} about page has no WCAG AA violations`, async () => {
      const html = renderAboutPage({
        Layout: tpl.layout.Layout,
        AboutPage: tpl.about.AboutPage,
      });
      const result = await runAxe(html, tpl.name);
      if (result.violations.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`\n${tpl.name} a11y violations:\n${describeViolations(result)}`);
      }
      expect(result.violations).toEqual([]);
    });
  }
});
