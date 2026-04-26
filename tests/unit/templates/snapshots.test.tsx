/**
 * @jest-environment node
 *
 * Phase R5c — Template snapshot regression test.
 *
 * Renders every template × every page combination with a fixture
 * `ProfileData` and snapshots the resulting HTML. A future refactor
 * that changes rendered output has to intentionally re-approve the
 * snapshot — no silent visual regressions.
 *
 * Implementation notes:
 *   - Relative imports instead of `@/templates/...` — the Jest + nextJest
 *     moduleNameMapper orders the `@/` catch-all before the template-
 *     specific alias, so the aliased path resolves to `src/templates/`
 *     which doesn't exist. Same trick as `analytics-offline.test.ts`.
 *   - `meta.generatedAt` is fixed to a constant so snapshots are stable.
 *   - `chatbot` is undefined so the inline bootstrap doesn't fire — its
 *     script body includes portfolio-specific state we don't want in
 *     the snapshot diff.
 *   - `og.png` is baked by the generator (not the templates) and is
 *     out of scope here.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ProfileData,
  Project,
  Testimonial,
} from "../../../templates/_shared/types";

// ─── Per-template imports ────────────────────────────────────────────────────

import * as minimalLayout from "../../../templates/minimal/components/Layout";
import * as minimalIndex from "../../../templates/minimal/pages/index";
import * as minimalAbout from "../../../templates/minimal/pages/about";
import * as minimalProjects from "../../../templates/minimal/pages/projects";
import * as minimalDetail from "../../../templates/minimal/pages/project-detail";
import * as minimalContact from "../../../templates/minimal/pages/contact";

import * as classicLayout from "../../../templates/classic/components/Layout";
import * as classicIndex from "../../../templates/classic/pages/index";
import * as classicAbout from "../../../templates/classic/pages/about";
import * as classicProjects from "../../../templates/classic/pages/projects";
import * as classicDetail from "../../../templates/classic/pages/project-detail";
import * as classicContact from "../../../templates/classic/pages/contact";

import * as researchLayout from "../../../templates/research/components/Layout";
import * as researchIndex from "../../../templates/research/pages/index";
import * as researchAbout from "../../../templates/research/pages/about";
import * as researchProjects from "../../../templates/research/pages/projects";
import * as researchDetail from "../../../templates/research/pages/project-detail";
import * as researchContact from "../../../templates/research/pages/contact";

import * as terminalLayout from "../../../templates/terminal/components/Layout";
import * as terminalIndex from "../../../templates/terminal/pages/index";
import * as terminalAbout from "../../../templates/terminal/pages/about";
import * as terminalProjects from "../../../templates/terminal/pages/projects";
import * as terminalDetail from "../../../templates/terminal/pages/project-detail";
import * as terminalContact from "../../../templates/terminal/pages/contact";

import * as editorialLayout from "../../../templates/editorial/components/Layout";
import * as editorialIndex from "../../../templates/editorial/pages/index";
import * as editorialAbout from "../../../templates/editorial/pages/about";
import * as editorialProjects from "../../../templates/editorial/pages/projects";
import * as editorialDetail from "../../../templates/editorial/pages/project-detail";
import * as editorialContact from "../../../templates/editorial/pages/contact";

import * as signalLayout from "../../../templates/signal/components/Layout";
import * as signalIndex from "../../../templates/signal/pages/index";
import * as signalAbout from "../../../templates/signal/pages/about";
import * as signalProjects from "../../../templates/signal/pages/projects";
import * as signalDetail from "../../../templates/signal/pages/project-detail";
import * as signalContact from "../../../templates/signal/pages/contact";

import * as studioLayout from "../../../templates/studio/components/Layout";
import * as studioIndex from "../../../templates/studio/pages/index";
import * as studioAbout from "../../../templates/studio/pages/about";
import * as studioProjects from "../../../templates/studio/pages/projects";
import * as studioDetail from "../../../templates/studio/pages/project-detail";
import * as studioContact from "../../../templates/studio/pages/contact";

// ─── Fixture ────────────────────────────────────────────────────────────────

const fixtureProject: Project = {
  id: "proj-1",
  name: "Signal Forge",
  repoUrl: "https://github.com/acme/signal-forge",
  description: "A tool for crafting proof-backed portfolios.",
  techStack: ["TypeScript", "Next.js", "Drizzle"],
  isFeatured: true,
  displayOrder: 0,
  sections: {
    summary:
      "Signal Forge assembles GitHub evidence into a defensible portfolio.",
    architecture:
      "Edge-deployed static generator with a Postgres source of truth.",
    techNarrative:
      "TypeScript end-to-end; React 18 + renderToStaticMarkup for templates.",
    recruiterPitch:
      "Shipped a dev-tool used by 500+ engineers, 4k+ stars.",
    engineerDeepDive:
      "The fact-extractor uses a two-pass LLM rubric with deterministic post-filters.",
  },
  metadata: {
    stars: 4200,
    forks: 312,
    language: "TypeScript",
    topics: ["portfolio", "ai", "dx"],
    lastUpdated: "2026-01-01T00:00:00.000Z",
    license: "MIT",
  },
  facts: [
    {
      claim: "Written in TypeScript",
      category: "tech_stack",
      evidenceRef: "package.json",
      evidenceType: "dependency",
      evidenceText: '"typescript": "^5.4.0" in package.json',
      confidence: 0.95,
      isVerified: true,
    },
    {
      claim: "Uses Drizzle ORM for the Postgres source of truth",
      category: "architecture",
      evidenceRef: "src/lib/db/schema.ts",
      evidenceType: "repo_file",
      evidenceText:
        "import { pgTable } from 'drizzle-orm/pg-core'; 12 tables defined in schema.ts.",
      confidence: 0.9,
      isVerified: true,
    },
    {
      claim: "Server-side template rendering via renderToStaticMarkup",
      category: "architecture",
      evidenceType: "readme",
      confidence: 0.7,
      isVerified: false,
    },
  ],
  characterization: "Open-source project · 4.2k stars · 23 contributors",
  outcomes: [
    {
      metric: "GitHub stars",
      value: "4.2k",
      context: "since launch",
      evidenceRef: "https://github.com/acme/signal-forge/stargazers",
    },
    {
      metric: "Active users",
      value: "500+",
      context: "last 30 days",
    },
  ],
  // Phase E2 — exercise the new shared components in the snapshot suite.
  // Without these the credibility byline / demo block / storyboard never
  // render and the suite would silently regress.
  credibility: {
    category: "oss_author",
    authorshipStatus: "ok",
    contributorCount: 23,
    hasCi: true,
    hasTests: true,
    hasReleases: true,
    externalUrl: "https://signal-forge.example.test",
  },
  demos: [
    {
      id: "demo-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      type: "youtube",
      title: "Signal Forge in 90 seconds",
      order: 0,
      thumbnailUrl: null,
      oembedTitle: null,
      oembedFetchedAt: null,
    },
  ],
  storyboard: {
    schemaVersion: 1,
    mermaid: "graph TD\n  A[Repo] --> B[Pipeline]\n  B --> C[Static Site]",
    cards: [
      {
        id: "what",
        icon: "Lightbulb",
        title: "What it does",
        description:
          "Turns a GitHub history into a proof-backed portfolio site.",
        claims: [
          {
            label: "Reads N projects per portfolio",
            verifier: { kind: "file", glob: "src/lib/db/schema.ts" },
            status: "verified",
            evidence: "schema.ts confirms multi-project table",
          },
        ],
        extra: null,
      },
      {
        id: "how",
        icon: "Cog",
        title: "How it works",
        description: "9-step pipeline: fetch → extract → narrate → verify.",
        claims: [
          {
            label: "Uses Drizzle for Postgres",
            verifier: {
              kind: "dep",
              package: "drizzle-orm",
              ecosystem: "npm",
            },
            status: "verified",
            evidence: "drizzle-orm@^0.30 in package.json",
          },
        ],
        extra: null,
      },
      {
        id: "interesting_file",
        icon: "FileCode",
        title: "Worth a look",
        description: "The pipeline orchestrator: state machine + retries.",
        claims: [],
        extra: {
          kind: "file_snippet",
          path: "src/lib/pipeline/orchestrator.ts",
          snippet: "export class PipelineOrchestrator { /* ... */ }",
          language: "typescript",
          url: null,
          cloneCommand: null,
        },
      },
      {
        id: "tested",
        icon: "Check",
        title: "Tested",
        description: "Jest covers the helpers; integration tests cover the API.",
        claims: [
          {
            label: "1000+ unit tests",
            verifier: { kind: "workflow", category: "test" },
            status: "verified",
            evidence: "ci.yml runs jest",
          },
        ],
        extra: null,
      },
      {
        id: "deploys",
        icon: "Rocket",
        title: "Deploys",
        description: "Cloudflare Pages auto-provisions per portfolio.",
        claims: [],
        extra: null,
      },
      {
        id: "try_it",
        icon: "Play",
        title: "Try it",
        description: "Click through to the live site.",
        claims: [],
        extra: {
          kind: "demo",
          url: "https://signal-forge.example.test",
          cloneCommand: "git clone https://github.com/acme/signal-forge",
          path: null,
          snippet: null,
          language: null,
        },
      },
    ],
  },
};

const fixtureTestimonial: Testimonial = {
  quote:
    "Working with her changed how we ship — the kind of engineer whose taste you feel in the product.",
  authorName: "Alex Example",
  authorTitle: "VP Engineering",
  authorCompany: "Acme",
  authorUrl: "https://example.test/alex",
};

const fixture: ProfileData = {
  meta: {
    // Fixed so snapshots stay stable across runs.
    generatedAt: "2026-01-01T00:00:00.000Z",
    templateId: "fixture",
    portfolioSlug: "jane-doe",
    siteUrl: "https://jane.example.test",
    ogImageUrl: "/og.png",
    // null disables the analytics beacon script — keeps snapshots free
    // of URL noise from `NEXT_PUBLIC_APP_URL`.
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
      { network: "LinkedIn", username: "janedoe", url: "https://linkedin.com/in/janedoe" },
    ],
    positioning:
      "I build accessible, pixel-perfect experiences for the web.",
    namedEmployers: ["Apple", "Klaviyo"],
    hiring: {
      status: "available",
      ctaText: "Let's work together",
      ctaHref: "mailto:jane@example.test",
    },
    anchorStat: {
      value: "4.2k+",
      unit: "GitHub stars",
      context: "on Signal Forge",
      sourceRef: "https://github.com/acme/signal-forge",
    },
  },
  skills: [
    {
      name: "TypeScript",
      category: "language",
      evidence: [{ projectName: "Signal Forge", usage: "primary language" }],
    },
    {
      name: "Next.js",
      category: "framework",
      evidence: [{ projectName: "Signal Forge", usage: "app router" }],
    },
  ],
  projects: [fixtureProject],
  experience: [
    {
      company: "Apple",
      position: "Senior Software Engineer",
      startDate: "2022",
      endDate: "2025",
      summary: "Led the design-system team.",
    },
  ],
  education: [
    {
      institution: "Cornell Tech",
      area: "Computer Science",
      studyType: "M.S.",
      startDate: "2019",
      endDate: "2021",
    },
  ],
  testimonials: [fixtureTestimonial],
  // Intentionally undefined — the chatbot bootstrap otherwise inlines a
  // script blob whose string we don't want to snapshot.
  chatbot: undefined,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Render one page wrapped in its template's Layout, mimicking what
 * renderer.ts does in production. Returns the full HTML string.
 *
 * `LayoutComponent` is typed as `ComponentType<any>` because each
 * template's Layout has slightly-different `children` + prop shapes
 * that diverged in different Phase releases (e.g. signal's inline
 * theme-toggle script). Snapshot stability matters here more than
 * prop strictness; the fixture is explicit.
 */
function renderPage(
  LayoutComponent: React.ComponentType<any>,
  currentPage: string,
  children: React.ReactNode
): string {
  const markup = renderToStaticMarkup(
    React.createElement(
      LayoutComponent,
      {
        profileData: fixture,
        currentPage,
        cssContent: "/* fixture */",
      },
      children
    )
  );
  return `<!DOCTYPE html>\n${markup}`;
}

/**
 * Bundle one template's five page renderers under a single descriptor
 * so the outer loop stays flat.
 */
interface TemplateBundle {
  id: string;
  Layout: React.ComponentType<any>;
  HomePage: React.ComponentType<any>;
  AboutPage: React.ComponentType<any>;
  ProjectsPage: React.ComponentType<any>;
  ProjectDetailPage: React.ComponentType<any>;
  ContactPage: React.ComponentType<any>;
}

const TEMPLATES: TemplateBundle[] = [
  {
    id: "minimal",
    Layout: minimalLayout.Layout,
    HomePage: minimalIndex.HomePage,
    AboutPage: minimalAbout.AboutPage,
    ProjectsPage: minimalProjects.ProjectsPage,
    ProjectDetailPage: minimalDetail.ProjectDetailPage,
    ContactPage: minimalContact.ContactPage,
  },
  {
    id: "classic",
    Layout: classicLayout.Layout,
    HomePage: classicIndex.HomePage,
    AboutPage: classicAbout.AboutPage,
    ProjectsPage: classicProjects.ProjectsPage,
    ProjectDetailPage: classicDetail.ProjectDetailPage,
    ContactPage: classicContact.ContactPage,
  },
  {
    id: "research",
    Layout: researchLayout.Layout,
    HomePage: researchIndex.HomePage,
    AboutPage: researchAbout.AboutPage,
    ProjectsPage: researchProjects.ProjectsPage,
    ProjectDetailPage: researchDetail.ProjectDetailPage,
    ContactPage: researchContact.ContactPage,
  },
  {
    id: "terminal",
    Layout: terminalLayout.Layout,
    HomePage: terminalIndex.HomePage,
    AboutPage: terminalAbout.AboutPage,
    ProjectsPage: terminalProjects.ProjectsPage,
    ProjectDetailPage: terminalDetail.ProjectDetailPage,
    ContactPage: terminalContact.ContactPage,
  },
  {
    id: "editorial",
    Layout: editorialLayout.Layout,
    HomePage: editorialIndex.HomePage,
    AboutPage: editorialAbout.AboutPage,
    ProjectsPage: editorialProjects.ProjectsPage,
    ProjectDetailPage: editorialDetail.ProjectDetailPage,
    ContactPage: editorialContact.ContactPage,
  },
  {
    id: "signal",
    Layout: signalLayout.Layout,
    HomePage: signalIndex.HomePage,
    AboutPage: signalAbout.AboutPage,
    ProjectsPage: signalProjects.ProjectsPage,
    ProjectDetailPage: signalDetail.ProjectDetailPage,
    ContactPage: signalContact.ContactPage,
  },
  {
    id: "studio",
    Layout: studioLayout.Layout,
    HomePage: studioIndex.HomePage,
    AboutPage: studioAbout.AboutPage,
    ProjectsPage: studioProjects.ProjectsPage,
    ProjectDetailPage: studioDetail.ProjectDetailPage,
    ContactPage: studioContact.ContactPage,
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Template snapshots — 7 templates × 5 pages = 35 outputs", () => {
  for (const bundle of TEMPLATES) {
    describe(`template: ${bundle.id}`, () => {
      it("renders the home page", () => {
        const html = renderPage(
          bundle.Layout,
          "home",
          React.createElement(bundle.HomePage, { profileData: fixture })
        );
        expect(html).toMatchSnapshot();
      });

      it("renders the about page", () => {
        const html = renderPage(
          bundle.Layout,
          "about",
          React.createElement(bundle.AboutPage, { profileData: fixture })
        );
        expect(html).toMatchSnapshot();
      });

      it("renders the projects list page", () => {
        const html = renderPage(
          bundle.Layout,
          "projects",
          React.createElement(bundle.ProjectsPage, { profileData: fixture })
        );
        expect(html).toMatchSnapshot();
      });

      it("renders the project-detail page", () => {
        const html = renderPage(
          bundle.Layout,
          "projects",
          React.createElement(bundle.ProjectDetailPage, {
            project: fixtureProject,
          })
        );
        expect(html).toMatchSnapshot();
      });

      it("renders the contact page", () => {
        const html = renderPage(
          bundle.Layout,
          "contact",
          React.createElement(bundle.ContactPage, { profileData: fixture })
        );
        expect(html).toMatchSnapshot();
      });
    });
  }
});
