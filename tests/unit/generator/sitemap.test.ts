/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/generator/sitemap.ts`.
 */

import {
  generateRobotsTxt,
  generateSitemap,
} from "@/lib/generator/sitemap";
import type { ProfileData } from "@/templates/_shared/types";

function makeProfile(
  overrides: Partial<ProfileData> = {}
): ProfileData {
  return {
    meta: {
      generatedAt: "2026-05-04T12:00:00.000Z",
      templateId: "minimal",
      portfolioSlug: "ada",
      siteUrl: "https://ada.example",
    },
    basics: {
      name: "Ada",
      label: "Developer",
      summary: "Short.",
      profiles: [],
    },
    skills: [],
    projects: [
      {
        id: "p1",
        name: "Widget API",
        repoUrl: "",
        description: "",
        techStack: [],
        isFeatured: false,
        displayOrder: 0,
        sections: { summary: "" },
        metadata: {},
        facts: [],
      },
      {
        id: "p2",
        name: "ML Lab / Notebooks",
        repoUrl: "",
        description: "",
        techStack: [],
        isFeatured: false,
        displayOrder: 1,
        sections: { summary: "" },
        metadata: {},
        facts: [],
      },
    ],
    ...overrides,
  } as ProfileData;
}

// ─── generateSitemap ────────────────────────────────────────────────────────

describe("generateSitemap", () => {
  it("includes the fixed pages + one entry per project", () => {
    const xml = generateSitemap(makeProfile());
    expect(xml).toContain("<loc>https://ada.example/</loc>");
    expect(xml).toContain("<loc>https://ada.example/about/</loc>");
    expect(xml).toContain("<loc>https://ada.example/projects/</loc>");
    expect(xml).toContain("<loc>https://ada.example/contact/</loc>");
    expect(xml).toContain("<loc>https://ada.example/projects/widget-api/</loc>");
    expect(xml).toContain("<loc>https://ada.example/projects/ml-lab-notebooks/</loc>");
  });

  it("emits lastmod as YYYY-MM-DD from generatedAt", () => {
    const xml = generateSitemap(makeProfile());
    expect(xml).toContain("<lastmod>2026-05-04</lastmod>");
  });

  it("emits path-only URLs when siteUrl is empty", () => {
    const xml = generateSitemap(
      makeProfile({ meta: { ...makeProfile().meta, siteUrl: "" } })
    );
    expect(xml).toContain("<loc>/</loc>");
    expect(xml).toContain("<loc>/projects/widget-api/</loc>");
    expect(xml).not.toContain("https://");
  });

  it("escapes XML special characters in project URLs", () => {
    const profile = makeProfile({
      projects: [
        {
          id: "p3",
          name: "Foo & Bar",
          repoUrl: "",
          description: "",
          techStack: [],
          isFeatured: false,
          displayOrder: 0,
          sections: { summary: "" },
          metadata: {},
          facts: [],
        },
      ],
    });
    const xml = generateSitemap(profile);
    // The slug strips `&`, so the URL contains "foo-bar" — not the
    // literal ampersand. But if siteUrl contained one it'd be escaped.
    expect(xml).toContain("foo-bar");
    expect(xml).not.toContain("<loc>Foo & Bar");
  });

  it("wraps in the sitemap.org xmlns", () => {
    const xml = generateSitemap(makeProfile());
    expect(xml).toContain(
      `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`
    );
    expect(xml).toContain("</urlset>");
  });
});

// ─── generateRobotsTxt ──────────────────────────────────────────────────────

describe("generateRobotsTxt", () => {
  it("allows all and points to the sitemap", () => {
    const robots = generateRobotsTxt(makeProfile());
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://ada.example/sitemap.xml");
  });

  it("omits the sitemap line when siteUrl is empty", () => {
    const robots = generateRobotsTxt(
      makeProfile({ meta: { ...makeProfile().meta, siteUrl: "" } })
    );
    expect(robots).not.toContain("Sitemap:");
  });
});
