import React from "react";
import { readFile } from "fs/promises";
import path from "path";
import type { ProfileData, Project } from "@/templates/_shared/types";

// Dynamic import for react-dom/server to avoid Next.js webpack restrictions
async function getRenderer() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup;
}

// Dynamic imports for template components to avoid static bundling issues
async function getTemplateComponents() {
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
  return { Layout, HomePage, AboutPage, ProjectsPage, ProjectDetailPage, ContactPage };
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
    await getTemplateComponents();

  // ── Load CSS ────────────────────────────────────────────────────────────
  const cssPath = path.join(
    process.cwd(),
    "templates",
    templateId,
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
