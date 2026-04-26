/**
 * @jest-environment node
 *
 * Phase E2 — direct render tests for the four shared components that
 * surface storyboard / demos / credibility / evidence on the published
 * site. Snapshot coverage in `snapshots.test.tsx` proves the *integration*
 * works (signal's project-detail page renders the components inline);
 * these tests pin down the *contract* of each component in isolation —
 * what it renders for happy paths, edge cases, and missing data.
 *
 * No DB, no LLM, no file I/O. Pure props → HTML.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ProjectCredibility,
  ProjectDemo,
  ProjectFact,
  StoryboardPayload,
} from "../../../templates/_shared/types";
import { CredibilityByline } from "../../../templates/_shared/credibility-byline";
import { ProjectDemos } from "../../../templates/_shared/project-demos";
import { StoryboardCards } from "../../../templates/_shared/storyboard-cards";
import { EvidenceList } from "../../../templates/_shared/evidence-list";

// ─── CredibilityByline ──────────────────────────────────────────────────────

describe("CredibilityByline", () => {
  it("returns nothing when credibility is undefined", () => {
    const html = renderToStaticMarkup(
      <CredibilityByline credibility={undefined} />
    );
    expect(html).toBe("");
  });

  it("returns nothing when no chip would have content", () => {
    const html = renderToStaticMarkup(
      <CredibilityByline credibility={{ authorshipStatus: "missing" }} />
    );
    expect(html).toBe("");
  });

  it("hides the unspecified category", () => {
    // A category of `unspecified` carries no information; we don't want
    // a meaningless "Unspecified" badge cluttering the byline.
    const html = renderToStaticMarkup(
      <CredibilityByline credibility={{ category: "unspecified" }} />
    );
    expect(html).toBe("");
  });

  it("renders contributor count, CI tick, releases tick, live link", () => {
    const credibility: ProjectCredibility = {
      category: "oss_author",
      contributorCount: 8,
      hasCi: true,
      hasReleases: true,
      hasTests: true,
      externalUrl: "https://demo.example.test",
    };
    const html = renderToStaticMarkup(
      <CredibilityByline credibility={credibility} />
    );
    expect(html).toContain("OSS Author");
    expect(html).toContain("8 contributors");
    // The visible label is " CI" (a leading space follows the "✓" span).
    expect(html).toContain("> CI<");
    expect(html).toContain("> Tests<");
    expect(html).toContain("> Releases<");
    expect(html).toContain('href="https://demo.example.test"');
    expect(html).toContain("pwb-credibility-live");
  });

  it("uses singular when contributorCount === 1", () => {
    const html = renderToStaticMarkup(
      <CredibilityByline credibility={{ contributorCount: 1 }} />
    );
    expect(html).toContain("1 contributor<");
    expect(html).not.toContain("contributors");
  });

  it("appends a GitHub anchor when repoUrl is provided", () => {
    const html = renderToStaticMarkup(
      <CredibilityByline
        credibility={{ category: "oss_author" }}
        repoUrl="https://github.com/acme/x"
      />
    );
    expect(html).toContain('href="https://github.com/acme/x"');
    expect(html).toContain("pwb-credibility-repo");
  });
});

// ─── ProjectDemos ───────────────────────────────────────────────────────────

describe("ProjectDemos", () => {
  it("renders nothing when demos is undefined or empty", () => {
    expect(renderToStaticMarkup(<ProjectDemos demos={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<ProjectDemos demos={[]} />)).toBe("");
  });

  it("renders a single YouTube embed for one youtube demo", () => {
    const demos: ProjectDemo[] = [
      {
        id: "d1",
        url: "https://www.youtube.com/watch?v=abc12345678",
        type: "youtube",
        title: "Walkthrough",
        order: 0,
      },
    ];
    const html = renderToStaticMarkup(<ProjectDemos demos={demos} />);
    expect(html).toContain('src="https://www.youtube.com/embed/abc12345678"');
    expect(html).toContain('class="pwb-demo pwb-demo-iframe"');
  });

  it("renders an inline image for a single image demo", () => {
    const demos: ProjectDemo[] = [
      {
        id: "d1",
        url: "https://example.test/screenshot.png",
        type: "image",
        title: "Screenshot",
        order: 0,
      },
    ];
    const html = renderToStaticMarkup(<ProjectDemos demos={demos} />);
    expect(html).toContain('src="https://example.test/screenshot.png"');
    expect(html).toContain('alt="Screenshot"');
    expect(html).not.toContain("<iframe");
  });

  it("renders a CSS scroll-snap slideshow for multiple images", () => {
    const demos: ProjectDemo[] = [
      { id: "d1", url: "https://x.test/a.png", type: "image", title: null, order: 0 },
      { id: "d2", url: "https://x.test/b.png", type: "image", title: null, order: 1 },
      { id: "d3", url: "https://x.test/c.gif", type: "gif", title: null, order: 2 },
    ];
    const html = renderToStaticMarkup(<ProjectDemos demos={demos} />);
    expect(html).toContain("pwb-demo-slideshow");
    expect(html).toContain('src="https://x.test/a.png"');
    expect(html).toContain('src="https://x.test/b.png"');
    expect(html).toContain('src="https://x.test/c.gif"');
  });

  it("falls back to a link card for `other` types", () => {
    const demos: ProjectDemo[] = [
      {
        id: "d1",
        url: "https://example.test/some-page",
        type: "other",
        title: "Live demo",
        order: 0,
      },
    ];
    const html = renderToStaticMarkup(<ProjectDemos demos={demos} />);
    expect(html).toContain('class="pwb-demo pwb-demo-link"');
    expect(html).toContain('href="https://example.test/some-page"');
    expect(html).not.toContain("<iframe");
  });

  it("respects a null heading by suppressing the H3", () => {
    const demos: ProjectDemo[] = [
      {
        id: "d1",
        url: "https://example.test/x.png",
        type: "image",
        title: null,
        order: 0,
      },
    ];
    const html = renderToStaticMarkup(
      <ProjectDemos demos={demos} heading={null} />
    );
    expect(html).not.toContain("<h3");
  });
});

// ─── StoryboardCards ────────────────────────────────────────────────────────

describe("StoryboardCards", () => {
  function makePayload(): StoryboardPayload {
    return {
      schemaVersion: 1,
      mermaid: "graph TD; A-->B",
      cards: [
        {
          id: "what",
          icon: "Lightbulb",
          title: "What",
          description: "What this does",
          claims: [
            {
              label: "Has a README",
              verifier: { kind: "file", glob: "README.md" },
              status: "verified",
              evidence: null,
            },
          ],
          extra: null,
        },
        {
          id: "how",
          icon: "Cog",
          title: "How",
          description: "How it works",
          claims: [],
          extra: null,
        },
        {
          id: "interesting_file",
          icon: "FileCode",
          title: "File",
          description: "Look here",
          claims: [],
          extra: {
            kind: "file_snippet",
            path: "src/index.ts",
            snippet: "export const x = 1;",
            language: "typescript",
            url: null,
            cloneCommand: null,
          },
        },
        {
          id: "tested",
          icon: "Check",
          title: "Tested",
          description: "Tests",
          claims: [
            {
              label: "Has CI",
              verifier: { kind: "workflow", category: "test" },
              status: "flagged",
              evidence: null,
            },
          ],
          extra: null,
        },
        {
          id: "deploys",
          icon: "Rocket",
          title: "Deploys",
          description: "Ships to prod",
          claims: [],
          extra: null,
        },
        {
          id: "try_it",
          icon: "Play",
          title: "Try it",
          description: "Live demo",
          claims: [],
          extra: {
            kind: "demo",
            url: "https://demo.example.test",
            cloneCommand: "git clone repo",
            path: null,
            snippet: null,
            language: null,
          },
        },
      ],
    } as StoryboardPayload;
  }

  it("returns nothing when storyboard is undefined", () => {
    expect(
      renderToStaticMarkup(<StoryboardCards storyboard={undefined} />)
    ).toBe("");
  });

  it("renders all six card titles in order", () => {
    const html = renderToStaticMarkup(
      <StoryboardCards storyboard={makePayload()} />
    );
    const titles = ["What", "How", "File", "Tested", "Deploys", "Try it"];
    titles.forEach((t) => expect(html).toContain(t));
    // numbered prefix
    expect(html).toContain("01");
    expect(html).toContain("06");
  });

  it("renders verified vs flagged vs pending markers correctly", () => {
    const html = renderToStaticMarkup(
      <StoryboardCards storyboard={makePayload()} />
    );
    expect(html).toContain("pwb-storyboard-marker-ok");
    expect(html).toContain("pwb-storyboard-marker-flag");
  });

  it("renders the file_snippet extra as a code block", () => {
    const html = renderToStaticMarkup(
      <StoryboardCards storyboard={makePayload()} />
    );
    expect(html).toContain("src/index.ts");
    expect(html).toContain("export const x = 1;");
  });

  it("renders the demo extra as a try-it link with clone command", () => {
    const html = renderToStaticMarkup(
      <StoryboardCards storyboard={makePayload()} />
    );
    expect(html).toContain('href="https://demo.example.test"');
    expect(html).toContain("git clone repo");
  });

  it("renders the mermaid source inside a <pre class=\"mermaid\"> for client-side render", () => {
    // Phase E5 — switched from a <details> + mermaid.live link to an
    // inline <figure> with a `<pre class="mermaid">` source that the
    // bootstrap script swaps for an SVG. The source stays visible
    // when JS is disabled so visitors still see the diagram structure.
    const html = renderToStaticMarkup(
      <StoryboardCards storyboard={makePayload()} />
    );
    expect(html).toContain('<pre class="mermaid');
    expect(html).toContain("graph TD; A--&gt;B");
    expect(html).toContain("mermaid.js.org");
    // Bootstrap script is included so the page renders the SVG when
    // JS is available.
    expect(html).toContain("cdn.jsdelivr.net/npm/mermaid");
  });

  it("suppresses the diagram when diagramHeading is null", () => {
    const html = renderToStaticMarkup(
      <StoryboardCards
        storyboard={makePayload()}
        diagramHeading={null}
      />
    );
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("pre class=\"mermaid");
  });
});

// ─── EvidenceList ───────────────────────────────────────────────────────────

describe("EvidenceList", () => {
  it("returns nothing when facts is undefined or empty", () => {
    expect(renderToStaticMarkup(<EvidenceList facts={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<EvidenceList facts={[]} />)).toBe("");
  });

  it("renders the claim text and the verified tick when isVerified is true", () => {
    const facts: ProjectFact[] = [
      {
        claim: "Uses TypeScript",
        category: "tech_stack",
        evidenceType: "dependency",
        isVerified: true,
      },
    ];
    const html = renderToStaticMarkup(<EvidenceList facts={facts} />);
    expect(html).toContain("Uses TypeScript");
    expect(html).toContain("pwb-evidence-tick");
    expect(html).toContain("from package.json"); // formatEvidenceType("dependency")
  });

  it("renders the evidence quote and ref behind <details>", () => {
    const facts: ProjectFact[] = [
      {
        claim: "Has CI",
        category: "infrastructure",
        evidenceText: "name: CI\non: [push]\njobs: ...",
        evidenceRef: ".github/workflows/ci.yml",
      },
    ];
    const html = renderToStaticMarkup(<EvidenceList facts={facts} />);
    expect(html).toContain("<details");
    expect(html).toContain("name: CI");
    expect(html).toContain(".github/workflows/ci.yml");
  });

  it("does not render <details> when no evidence text/ref is present", () => {
    const facts: ProjectFact[] = [
      {
        claim: "A bare claim",
        category: "concept",
      },
    ];
    const html = renderToStaticMarkup(<EvidenceList facts={facts} />);
    expect(html).toContain("A bare claim");
    expect(html).not.toContain("<details");
  });

  it("filters to verified-only when verifiedOnly=true", () => {
    const facts: ProjectFact[] = [
      { claim: "Verified one", category: "x", isVerified: true },
      { claim: "Unverified one", category: "x", isVerified: false },
    ];
    const html = renderToStaticMarkup(
      <EvidenceList facts={facts} verifiedOnly={true} />
    );
    expect(html).toContain("Verified one");
    expect(html).not.toContain("Unverified one");
  });

  it("returns nothing when verifiedOnly filters out everything", () => {
    const facts: ProjectFact[] = [
      { claim: "Unverified", category: "x", isVerified: false },
    ];
    const html = renderToStaticMarkup(
      <EvidenceList facts={facts} verifiedOnly={true} />
    );
    expect(html).toBe("");
  });

  it("respects the limit prop", () => {
    const facts: ProjectFact[] = Array.from({ length: 12 }, (_, i) => ({
      claim: `Fact ${i}`,
      category: "x",
    }));
    const html = renderToStaticMarkup(
      <EvidenceList facts={facts} limit={3} />
    );
    expect(html).toContain("Fact 0");
    expect(html).toContain("Fact 2");
    expect(html).not.toContain("Fact 3");
    expect(html).not.toContain("Fact 11");
  });

  it("sorts by descending confidence so strongest signals lead", () => {
    const facts: ProjectFact[] = [
      { claim: "Weak", category: "x", confidence: 0.3 },
      { claim: "Strong", category: "x", confidence: 0.95 },
      { claim: "Medium", category: "x", confidence: 0.7 },
    ];
    const html = renderToStaticMarkup(<EvidenceList facts={facts} />);
    const strongIdx = html.indexOf("Strong");
    const mediumIdx = html.indexOf("Medium");
    const weakIdx = html.indexOf("Weak");
    expect(strongIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(weakIdx);
  });
});
