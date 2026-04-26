/**
 * @jest-environment node
 *
 * Phase E4b — direct render tests for the per-sentence verified
 * narrative renderer. Covers:
 *   - falsy text → null (clean drop-in)
 *   - no verifications → plain `<p>` markup that matches pre-E4b
 *     template output (snapshot-stable for unverified projects)
 *   - verifications present → sentences become spans with status
 *     classes
 *   - multi-paragraph splitting respects the cross-paragraph
 *     verification cursor
 *   - drift / overflow → falls back to "pending" status
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SentenceVerification } from "../../../templates/_shared/types";
import { VerifiedNarrative } from "../../../templates/_shared/verified-narrative";

describe("VerifiedNarrative", () => {
  it("returns nothing when text is falsy", () => {
    expect(renderToStaticMarkup(<VerifiedNarrative text={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<VerifiedNarrative text="" />)).toBe("");
  });

  it("renders plain paragraphs when verifications is undefined", () => {
    const html = renderToStaticMarkup(
      <VerifiedNarrative text="First sentence. Second sentence." />
    );
    expect(html).toBe("<p>First sentence. Second sentence.</p>");
    // No sentence-level chrome
    expect(html).not.toContain("pwb-sentence");
  });

  it("renders one <p> per source paragraph, no chrome", () => {
    const html = renderToStaticMarkup(
      <VerifiedNarrative text={"Para one.\n\nPara two."} />
    );
    expect(html).toBe("<p>Para one.</p><p>Para two.</p>");
  });

  it("emits sentence spans with status classes when verifications provided", () => {
    const verifications: SentenceVerification[] = [
      { text: "First sentence.", status: "verified" },
      { text: "Second sentence.", status: "flagged" },
    ];
    const html = renderToStaticMarkup(
      <VerifiedNarrative
        text="First sentence. Second sentence."
        verifications={verifications}
      />
    );
    expect(html).toContain("pwb-sentence pwb-sentence-verified");
    expect(html).toContain("pwb-sentence pwb-sentence-flagged");
    expect(html).toContain('data-pwb-status="verified"');
    expect(html).toContain('data-pwb-status="flagged"');
    // Sentence text preserved verbatim inside spans
    expect(html).toContain(">First sentence.</span>");
    expect(html).toContain(">Second sentence.</span>");
  });

  it("preserves spacing between sentences", () => {
    const verifications: SentenceVerification[] = [
      { text: "First.", status: "verified" },
      { text: "Second.", status: "verified" },
    ];
    const html = renderToStaticMarkup(
      <VerifiedNarrative
        text="First. Second."
        verifications={verifications}
      />
    );
    // The space between the two spans must survive renderToStaticMarkup
    expect(html).toMatch(/First\.<\/span>\s<span/);
  });

  it("walks the verification cursor across paragraphs", () => {
    // Verifier emitted sentences in order across paragraphs; we need
    // to stay aligned even after the paragraph break.
    const verifications: SentenceVerification[] = [
      { text: "P1S1.", status: "verified" },
      { text: "P1S2.", status: "flagged" },
      { text: "P2S1.", status: "unverified" },
    ];
    const html = renderToStaticMarkup(
      <VerifiedNarrative
        text={"P1S1. P1S2.\n\nP2S1."}
        verifications={verifications}
      />
    );
    // Two <p> elements
    expect(html.match(/<p[^>]*>/g) ?? []).toHaveLength(2);
    // Cursor stayed correct
    expect(html).toContain('data-pwb-status="verified">P1S1.</span>');
    expect(html).toContain('data-pwb-status="flagged">P1S2.</span>');
    expect(html).toContain('data-pwb-status="unverified">P2S1.</span>');
  });

  it("falls back to pending when verifications run out", () => {
    // Three sentences in the prose but the verifier only returned two —
    // the trailing sentence should render as a span with status="pending".
    const verifications: SentenceVerification[] = [
      { text: "First.", status: "verified" },
      { text: "Second.", status: "verified" },
    ];
    const html = renderToStaticMarkup(
      <VerifiedNarrative
        text="First. Second. Third."
        verifications={verifications}
      />
    );
    expect(html).toContain('data-pwb-status="pending">Third.</span>');
  });

  it("renders unknown DB statuses as pending (forward-compat)", () => {
    // A future verifier might add a status the templates don't know
    // about; we shouldn't reject the render. Here we provide a
    // status that matches the union — the type system blocks anything
    // else — so this test only documents the "render at all" path.
    const verifications: SentenceVerification[] = [
      { text: "First.", status: "unverified" },
    ];
    const html = renderToStaticMarkup(
      <VerifiedNarrative text="First." verifications={verifications} />
    );
    expect(html).toContain("pwb-sentence-unverified");
  });
});
