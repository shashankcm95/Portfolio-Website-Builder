/**
 * @jest-environment node
 *
 * Unit tests for the Tier 1 (static) layout-review rules.
 *
 * Each rule has a "clean" fixture that should pass + a "bad" fixture
 * that triggers it. Rules: R1 (img alt), R2 (h1 count), R3 (heading
 * skip), R4 (title length), R5 (meta description), R6 (html lang),
 * R7 (internal-link broken), R8 (script src undefined / chatbot id).
 */

import { runStaticChecks } from "@/lib/review/rules-static";

function fixture(body: string, opts: Partial<{
  title: string;
  description: string;
  htmlLang: string | null;
}> = {}): string {
  const title = opts.title ?? "Ada Lovelace — Mathematician";
  const description =
    opts.description ??
    "Mathematician and writer on Charles Babbage's Analytical Engine — a working portfolio with verified facts.";
  const langAttr = opts.htmlLang === null ? "" : ` lang="${opts.htmlLang ?? "en"}"`;
  return `<!DOCTYPE html><html${langAttr}><head>
<title>${title}</title>
<meta name="description" content="${description}" />
</head><body>${body}</body></html>`;
}

function makeFiles(html: string, page: string = "index.html"): Map<string, string> {
  return new Map([
    [page, html],
    // Always include the "linked" pages so R7 doesn't trip on standard nav.
    ["about/index.html", fixture("<h1>About</h1>")],
    ["projects/index.html", fixture("<h1>Projects</h1>")],
    ["contact/index.html", fixture("<h1>Contact</h1>")],
    ["styles/global.css", "body { color: red; }"],
  ]);
}

describe("runStaticChecks — happy path", () => {
  it("returns no issues on a well-formed page", () => {
    const html = fixture(`
      <h1>Ada Lovelace</h1>
      <h2>About</h2>
      <p>Hello.</p>
      <a href="/about/">About</a>
    `);
    const issues = runStaticChecks(makeFiles(html));
    // Filter out per-helper-page issues that aren't about the under-test page.
    const onIndex = issues.filter((i) => i.page === "index");
    expect(onIndex).toEqual([]);
  });
});

describe("R1 — img alt", () => {
  it("flags an <img> missing alt", () => {
    const html = fixture(`<h1>X</h1><img src="/avatar.png" />`);
    const issues = runStaticChecks(makeFiles(html));
    const r1 = issues.filter(
      (i) => i.rule === "R1-img-missing-alt" && i.page === "index"
    );
    expect(r1).toHaveLength(1);
    expect(r1[0].severity).toBe("warning");
  });

  it("does NOT flag an <img> with role=presentation", () => {
    const html = fixture(
      `<h1>X</h1><img src="/avatar.png" role="presentation" />`
    );
    const issues = runStaticChecks(makeFiles(html));
    const r1 = issues.filter((i) => i.rule === "R1-img-missing-alt");
    expect(r1).toHaveLength(0);
  });

  it("does NOT flag an <img> with empty alt (decorative)", () => {
    const html = fixture(`<h1>X</h1><img src="/avatar.png" alt="" />`);
    const issues = runStaticChecks(makeFiles(html));
    const r1 = issues.filter((i) => i.rule === "R1-img-missing-alt");
    expect(r1).toHaveLength(0);
  });
});

describe("R2 — h1 count", () => {
  it("flags zero h1", () => {
    const html = fixture(`<h2>No top heading</h2>`);
    const issues = runStaticChecks(makeFiles(html));
    expect(issues.find((i) => i.rule === "R2-no-h1" && i.page === "index")).toBeDefined();
  });

  it("flags multiple h1", () => {
    const html = fixture(`<h1>One</h1><h1>Two</h1>`);
    const issues = runStaticChecks(makeFiles(html));
    const r2 = issues.find(
      (i) => i.rule === "R2-multiple-h1" && i.page === "index"
    );
    expect(r2).toBeDefined();
    expect(r2!.details).toEqual({ count: 2 });
  });

  it("doesn't flag exactly one h1", () => {
    const html = fixture(`<h1>One</h1><h2>Sub</h2>`);
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find((i) => i.rule.startsWith("R2-") && i.page === "index")
    ).toBeUndefined();
  });
});

describe("R3 — heading skip", () => {
  it("info on h1 → h3", () => {
    const html = fixture(`<h1>A</h1><h3>B</h3>`);
    const issues = runStaticChecks(makeFiles(html));
    const r3 = issues.find((i) => i.rule === "R3-heading-skip" && i.page === "index");
    expect(r3).toBeDefined();
    expect(r3!.severity).toBe("info");
  });

  it("doesn't fire on h1 → h2 → h3", () => {
    const html = fixture(`<h1>A</h1><h2>B</h2><h3>C</h3>`);
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find((i) => i.rule === "R3-heading-skip" && i.page === "index")
    ).toBeUndefined();
  });
});

describe("R4 — title length", () => {
  it("critical when missing", () => {
    const html = fixture(`<h1>X</h1>`, { title: "" });
    const issues = runStaticChecks(makeFiles(html));
    const r4 = issues.find((i) => i.rule === "R4-title-missing" && i.page === "index");
    expect(r4).toBeDefined();
    expect(r4!.severity).toBe("critical");
  });

  it("warning when too short", () => {
    const html = fixture(`<h1>X</h1>`, { title: "Hi" });
    const issues = runStaticChecks(makeFiles(html));
    const r4 = issues.find((i) => i.rule === "R4-title-short" && i.page === "index");
    expect(r4).toBeDefined();
  });

  it("warning when too long", () => {
    const html = fixture(`<h1>X</h1>`, { title: "x".repeat(80) });
    const issues = runStaticChecks(makeFiles(html));
    const r4 = issues.find((i) => i.rule === "R4-title-long" && i.page === "index");
    expect(r4).toBeDefined();
  });
});

describe("R5 — meta description", () => {
  it("warns when missing", () => {
    const html = fixture(`<h1>X</h1>`, { description: "" });
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R5-meta-description-missing" && i.page === "index"
      )
    ).toBeDefined();
  });

  it("info when too short", () => {
    const html = fixture(`<h1>X</h1>`, { description: "short" });
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R5-meta-description-short" && i.page === "index"
      )
    ).toBeDefined();
  });

  it("info when too long", () => {
    const html = fixture(`<h1>X</h1>`, { description: "x".repeat(200) });
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R5-meta-description-long" && i.page === "index"
      )
    ).toBeDefined();
  });
});

describe("R6 — html lang", () => {
  it("warns when html lang is missing", () => {
    const html = fixture(`<h1>X</h1>`, { htmlLang: null });
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find((i) => i.rule === "R6-html-lang-missing" && i.page === "index")
    ).toBeDefined();
  });
});

describe("R7 — internal link broken", () => {
  it("flags a link to a non-existent page", () => {
    const html = fixture(`<h1>X</h1><a href="/does-not-exist/">Broken</a>`);
    const issues = runStaticChecks(makeFiles(html));
    const r7 = issues.find(
      (i) => i.rule === "R7-internal-link-broken" && i.page === "index"
    );
    expect(r7).toBeDefined();
    expect(r7!.severity).toBe("critical");
  });

  it("doesn't flag valid /about/", () => {
    const html = fixture(`<h1>X</h1><a href="/about/">About</a>`);
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R7-internal-link-broken" && i.page === "index"
      )
    ).toBeUndefined();
  });

  it("ignores external + mailto + tel + hash", () => {
    const html = fixture(`
      <h1>X</h1>
      <a href="https://github.com/foo">GH</a>
      <a href="mailto:x@y">mail</a>
      <a href="tel:+1">tel</a>
      <a href="#top">hash</a>
    `);
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R7-internal-link-broken" && i.page === "index"
      )
    ).toBeUndefined();
  });
});

describe("R8 — script src undefined / bad chatbot id", () => {
  it("flags a script src containing 'undefined'", () => {
    const html = fixture(`<h1>X</h1><script src="/api/og?portfolioId=undefined" />`);
    const issues = runStaticChecks(makeFiles(html));
    const r8 = issues.find(
      (i) => i.rule === "R8-script-undefined-src" && i.page === "index"
    );
    expect(r8).toBeDefined();
    expect(r8!.severity).toBe("critical");
  });

  it("flags a chatbot embed with empty data-portfolio-id", () => {
    const html = fixture(
      `<h1>X</h1><script src="/chatbot-embed.js" data-portfolio-id=""></script>`
    );
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R8-chatbot-embed-id" && i.page === "index"
      )
    ).toBeDefined();
  });

  it("doesn't flag a valid chatbot embed", () => {
    const html = fixture(
      `<h1>X</h1><script src="/chatbot-embed.js" data-portfolio-id="abc-123"></script>`
    );
    const issues = runStaticChecks(makeFiles(html));
    expect(
      issues.find(
        (i) => i.rule === "R8-chatbot-embed-id" && i.page === "index"
      )
    ).toBeUndefined();
  });
});
