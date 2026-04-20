/**
 * @jest-environment jsdom
 *
 * Phase 6 — Semantic check on the portfolio OG layout.
 *
 * The layout is a plain React tree consumed by Satori at runtime — we
 * never actually render it to the DOM in production. That lets us
 * unit-test it cheaply: render the tree to static markup, assert the
 * rendered text includes what we expect.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PortfolioOgLayout,
  initials,
  type PortfolioOgInput,
} from "@/lib/og/layout-portfolio";
import { ProjectOgLayout } from "@/lib/og/layout-project";

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

// ─── Portfolio layout ───────────────────────────────────────────────────────

describe("PortfolioOgLayout", () => {
  const base: PortfolioOgInput = {
    name: "Ada Lovelace",
    label: "Analyst",
    summary: "Mathematician and writer on Charles Babbage's Analytical Engine.",
    avatarUrl: "https://cdn.example/ada.png",
    topSkills: ["Algebra", "Punched cards", "Logic"],
  };

  it("renders the owner name + label + summary", () => {
    const html = render(PortfolioOgLayout(base));
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Analyst");
    expect(html).toContain("Mathematician and writer");
  });

  it("emits up to 3 skill chips", () => {
    const html = render(
      PortfolioOgLayout({
        ...base,
        topSkills: ["A", "B", "C", "D", "E"],
      })
    );
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    expect(html).toContain(">C<");
    expect(html).not.toContain(">D<"); // 4th skill dropped
  });

  it("renders avatar <img> when avatarUrl is present", () => {
    const html = render(PortfolioOgLayout(base));
    expect(html).toContain("https://cdn.example/ada.png");
  });

  it("falls back to initials when avatar is absent", () => {
    const html = render(
      PortfolioOgLayout({ ...base, avatarUrl: null })
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("AL"); // initials of "Ada Lovelace"
  });

  it("truncates long summaries with an ellipsis", () => {
    const long = "x".repeat(400);
    const html = render(PortfolioOgLayout({ ...base, summary: long }));
    expect(html).not.toContain("x".repeat(400));
    expect(html).toMatch(/…/);
  });

  it("handles missing optional fields without crashing", () => {
    const html = render(
      PortfolioOgLayout({ name: "Anonymous" })
    );
    expect(html).toContain("Anonymous");
    // Default label is applied
    expect(html).toContain("Software Developer");
  });
});

describe("initials()", () => {
  it("returns two-letter initials from a full name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Grace Hopper")).toBe("GH");
  });
  it("returns the single letter for mono-name", () => {
    expect(initials("Cher")).toBe("C");
  });
  it("handles empty / whitespace input", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

// ─── Project layout ─────────────────────────────────────────────────────────

describe("ProjectOgLayout", () => {
  it("renders the project name as the hero, owner name small", () => {
    const html = render(
      ProjectOgLayout({
        ownerName: "Ada Lovelace",
        projectName: "Analytical Engine",
        description: "Mechanical general-purpose computer.",
        techStack: ["Babbage", "Punched cards"],
      })
    );
    expect(html).toContain("Analytical Engine");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Mechanical general-purpose computer.");
    expect(html).toContain("Punched cards");
  });

  it("limits tech stack to 5 chips", () => {
    const html = render(
      ProjectOgLayout({
        ownerName: "X",
        projectName: "Y",
        techStack: ["a", "b", "c", "d", "e", "f", "g"],
      })
    );
    expect(html).toContain(">a<");
    expect(html).toContain(">e<");
    expect(html).not.toContain(">f<");
  });
});
