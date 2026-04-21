import React from "react";
import { readFile } from "fs/promises";
import path from "path";
import type { ProfileData, Project } from "@/templates/_shared/types";
import { generateSitemap, generateRobotsTxt } from "./sitemap";

// Dynamic import for react-dom/server to avoid Next.js webpack restrictions
async function getRenderer() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup;
}

/**
 * Load a template's page + layout components by ID.
 *
 * Explicit per-template import branches keep Next.js / Webpack's static
 * analysis happy (it cannot follow fully dynamic import paths). To add a
 * new template, drop in a directory under `templates/` and add a new case.
 */
async function getTemplateComponents(templateId: string) {
  switch (templateId) {
    case "classic": {
      const [
        { Layout },
        { HomePage },
        { AboutPage },
        { ProjectsPage },
        { ProjectDetailPage },
        { ContactPage },
      ] = await Promise.all([
        import("@/templates/classic/components/Layout"),
        import("@/templates/classic/pages/index"),
        import("@/templates/classic/pages/about"),
        import("@/templates/classic/pages/projects"),
        import("@/templates/classic/pages/project-detail"),
        import("@/templates/classic/pages/contact"),
      ]);
      return {
        Layout,
        HomePage,
        AboutPage,
        ProjectsPage,
        ProjectDetailPage,
        ContactPage,
      };
    }
    // Phase 7 — academic / research minimal (Karpathy / colah-style).
    case "research": {
      const [
        { Layout },
        { HomePage },
        { AboutPage },
        { ProjectsPage },
        { ProjectDetailPage },
        { ContactPage },
      ] = await Promise.all([
        import("@/templates/research/components/Layout"),
        import("@/templates/research/pages/index"),
        import("@/templates/research/pages/about"),
        import("@/templates/research/pages/projects"),
        import("@/templates/research/pages/project-detail"),
        import("@/templates/research/pages/contact"),
      ]);
      return {
        Layout,
        HomePage,
        AboutPage,
        ProjectsPage,
        ProjectDetailPage,
        ContactPage,
      };
    }
    // Phase 7 — CLI / hacker aesthetic for SRE / systems / DevOps.
    case "terminal": {
      const [
        { Layout },
        { HomePage },
        { AboutPage },
        { ProjectsPage },
        { ProjectDetailPage },
        { ContactPage },
      ] = await Promise.all([
        import("@/templates/terminal/components/Layout"),
        import("@/templates/terminal/pages/index"),
        import("@/templates/terminal/pages/about"),
        import("@/templates/terminal/pages/projects"),
        import("@/templates/terminal/pages/project-detail"),
        import("@/templates/terminal/pages/contact"),
      ]);
      return {
        Layout,
        HomePage,
        AboutPage,
        ProjectsPage,
        ProjectDetailPage,
        ContactPage,
      };
    }
    // Phase 7 — typography-forward editorial for senior engineers /
    // technical leaders / designer-developer hybrids.
    case "editorial": {
      const [
        { Layout },
        { HomePage },
        { AboutPage },
        { ProjectsPage },
        { ProjectDetailPage },
        { ContactPage },
      ] = await Promise.all([
        import("@/templates/editorial/components/Layout"),
        import("@/templates/editorial/pages/index"),
        import("@/templates/editorial/pages/about"),
        import("@/templates/editorial/pages/projects"),
        import("@/templates/editorial/pages/project-detail"),
        import("@/templates/editorial/pages/contact"),
      ]);
      return {
        Layout,
        HomePage,
        AboutPage,
        ProjectsPage,
        ProjectDetailPage,
        ContactPage,
      };
    }
    case "minimal":
    default: {
      // Fall back to minimal so renders never fail on an unknown id.
      const [
        { Layout },
        { HomePage },
        { AboutPage },
        { ProjectsPage },
        { ProjectDetailPage },
        { ContactPage },
      ] = await Promise.all([
        import("@/templates/minimal/components/Layout"),
        import("@/templates/minimal/pages/index"),
        import("@/templates/minimal/pages/about"),
        import("@/templates/minimal/pages/projects"),
        import("@/templates/minimal/pages/project-detail"),
        import("@/templates/minimal/pages/contact"),
      ]);
      return {
        Layout,
        HomePage,
        AboutPage,
        ProjectsPage,
        ProjectDetailPage,
        ContactPage,
      };
    }
  }
}

/**
 * Resolve a templateId to the on-disk directory name, falling back to
 * "minimal" for unknown ids.
 */
function resolveTemplateDir(templateId: string): string {
  // Phase 7 — extend the dir map with the three new templates. Anything
  // unrecognised falls back to "minimal" so renders never fail.
  switch (templateId) {
    case "classic":
    case "research":
    case "terminal":
    case "editorial":
      return templateId;
    default:
      return "minimal";
  }
}

/**
 * Render a template to a set of static HTML files.
 *
 * Returns a Map of filepath -> content, including:
 *   - index.html
 *   - about/index.html
 *   - projects/index.html
 *   - projects/[slug]/index.html (one per project)
 *   - contact/index.html
 *   - styles/global.css
 */
export async function renderTemplate(
  templateId: string,
  profileData: ProfileData
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const renderToStaticMarkup = await getRenderer();
  const { Layout, HomePage, AboutPage, ProjectsPage, ProjectDetailPage, ContactPage } =
    await getTemplateComponents(templateId);

  // ── Load CSS ────────────────────────────────────────────────────────────
  const cssPath = path.join(
    process.cwd(),
    "templates",
    resolveTemplateDir(templateId),
    "styles",
    "global.css"
  );
  const cssContent = await readFile(cssPath, "utf-8");
  files.set("styles/global.css", cssContent);

  // ── Helper to render a page ───────────────────────────────────────────
  function renderPage(
    currentPage: string,
    renderContent: () => React.ReactElement
  ): string {
    const page = React.createElement(
      Layout,
      { profileData, currentPage, cssContent, children: renderContent() }
    );
    return `<!DOCTYPE html>\n${renderToStaticMarkup(page)}`;
  }

  // ── Render pages ──────────────────────────────────────────────────────
  files.set("index.html", renderPage("home", () =>
    React.createElement(HomePage, { profileData })
  ));

  files.set("about/index.html", renderPage("about", () =>
    React.createElement(AboutPage, { profileData })
  ));

  files.set("projects/index.html", renderPage("projects", () =>
    React.createElement(ProjectsPage, { profileData })
  ));

  for (const project of profileData.projects) {
    const slug = generateProjectSlug(project);
    files.set(`projects/${slug}/index.html`, renderPage("projects", () =>
      React.createElement(ProjectDetailPage, { project })
    ));
  }

  files.set("contact/index.html", renderPage("contact", () =>
    React.createElement(ContactPage, { profileData })
  ));

  // Phase 6 — SEO surface: sitemap + robots alongside the rest of the
  // published file tree. Cloudflare Pages serves both as static assets
  // at `/sitemap.xml` and `/robots.txt` respectively.
  files.set("sitemap.xml", generateSitemap(profileData));
  files.set("robots.txt", generateRobotsTxt(profileData));

  return files;
}

/**
 * Generate a URL-safe slug from a project name.
 */
function generateProjectSlug(project: Project): string {
  return project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
