/**
 * @jest-environment node
 *
 * Phase E4a — direct render tests for the engineer-vs-recruiter
 * narrative toggle. Covers:
 *   - "no engineer variant" path: toggle UI is suppressed entirely,
 *     children render once with the recruiter sections.
 *   - "engineer variant present" path: both panes render, two radios
 *     plus their labels are emitted, and CSS-only visibility swap is
 *     wired up by class names.
 *   - Engineer variant fall-through: when only some engineer keys are
 *     populated, the engineer pane fills the gaps from the recruiter
 *     copy (so visitors never see blank sections after toggling).
 *   - The render-prop receives the right `variant` flag.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "../../../templates/_shared/types";
import { NarrativeViewToggle } from "../../../templates/_shared/narrative-view-toggle";

const recruiter: Project["sections"] = {
  summary: "RECRUITER summary",
  architecture: "RECRUITER architecture",
  techNarrative: "RECRUITER stack",
  recruiterPitch: "RECRUITER pitch",
  engineerDeepDive: "RECRUITER deep dive",
};

const engineerFull: Project["engineerSections"] = {
  summary: "ENGINEER summary",
  architecture: "ENGINEER architecture",
  techNarrative: "ENGINEER stack",
  recruiterPitch: "ENGINEER pitch",
  engineerDeepDive: "ENGINEER deep dive",
};

function renderToggle(
  engineer: Project["engineerSections"] | undefined,
  scopeId = "test-id"
): string {
  return renderToStaticMarkup(
    <NarrativeViewToggle
      recruiter={recruiter}
      engineer={engineer}
      scopeId={scopeId}
    >
      {(sections, variant) => (
        <div data-variant={variant}>
          <p data-key="summary">{sections.summary}</p>
          <p data-key="arch">{sections.architecture}</p>
          <p data-key="stack">{sections.techNarrative}</p>
          <p data-key="deep">{sections.engineerDeepDive}</p>
        </div>
      )}
    </NarrativeViewToggle>
  );
}

describe("NarrativeViewToggle", () => {
  describe("when engineer variant is undefined", () => {
    it("renders the recruiter pane only with no toggle UI", () => {
      const html = renderToggle(undefined);
      expect(html).toContain("RECRUITER summary");
      expect(html).not.toContain("ENGINEER");
      // No radios, no toggle row
      expect(html).not.toContain("pwb-narrative-toggle-row");
      expect(html).not.toContain("pwb-narrative-radio");
      // Single-pane fallback class
      expect(html).toContain("pwb-narrative-single");
    });

    it("renders the recruiter pane only when engineer is empty object", () => {
      const html = renderToggle({});
      expect(html).toContain("RECRUITER summary");
      expect(html).not.toContain("ENGINEER");
      expect(html).not.toContain("pwb-narrative-toggle-row");
    });

    it("passes variant=recruiter to the render-prop in the no-toggle path", () => {
      const html = renderToggle(undefined);
      expect(html).toContain('data-variant="recruiter"');
      // Engineer variant is never rendered when no toggle is shown
      expect(html.match(/data-variant="engineer"/g) ?? []).toHaveLength(0);
    });
  });

  describe("when engineer variant is fully populated", () => {
    it("renders BOTH panes (CSS handles visibility swap)", () => {
      const html = renderToggle(engineerFull);
      expect(html).toContain("RECRUITER summary");
      expect(html).toContain("ENGINEER summary");
      expect(html).toContain("RECRUITER deep dive");
      expect(html).toContain("ENGINEER deep dive");
    });

    it("emits two radios with the recruiter one default-checked", () => {
      const html = renderToggle(engineerFull);
      expect(html).toContain('class="pwb-narrative-radio pwb-narrative-radio-recruiter"');
      expect(html).toContain('class="pwb-narrative-radio pwb-narrative-radio-engineer"');
      // React serializes `defaultChecked` as `checked` in static markup
      const recruiterMatch = html.match(
        /pwb-narrative-radio-recruiter[^>]*checked/
      );
      expect(recruiterMatch).not.toBeNull();
    });

    it("emits two labels pointing at the matching radio ids", () => {
      const html = renderToggle(engineerFull, "abc123");
      expect(html).toContain('for="pwb-view-recruiter-abc123"');
      expect(html).toContain('for="pwb-view-engineer-abc123"');
      expect(html).toContain("pwb-narrative-toggle-option-recruiter");
      expect(html).toContain("pwb-narrative-toggle-option-engineer");
    });

    it("scopes the radio name attribute to the project id", () => {
      const html = renderToggle(engineerFull, "abc123");
      expect(html).toContain('name="pwb-view-abc123"');
    });

    it("strips unsafe characters from the scope id", () => {
      // UUIDs with dashes are allowed; pathological inputs shouldn't
      // produce broken HTML attribute values.
      const html = renderToggle(engineerFull, "a/b<c>d=e&f");
      expect(html).toContain("pwb-view-recruiter-a_b_c_d_e_f");
      expect(html).not.toContain("a/b<c>d=e&f");
    });

    it("invokes the render-prop twice with matching variant flags", () => {
      const html = renderToggle(engineerFull);
      expect(html).toContain('data-variant="recruiter"');
      expect(html).toContain('data-variant="engineer"');
    });
  });

  describe("partial engineer variant", () => {
    it("falls through to recruiter copy for engineer keys that are absent", () => {
      // Only architecture is populated in engineer view; the rest must
      // fall through to the recruiter content so the engineer pane
      // never has blank sections.
      const html = renderToggle({
        architecture: "ENGINEER architecture",
      });
      // Toggle is shown because at least one engineer key exists
      expect(html).toContain("pwb-narrative-toggle-row");
      // Both panes contain the recruiter summary; engineer pane shows
      // its own architecture override, but other sections fall through.
      const engineerPane = html
        .split("pwb-narrative-pane-engineer")[1]
        ?.split("pwb-narrative-pane-")[0] ?? "";
      expect(engineerPane).toContain("ENGINEER architecture");
      expect(engineerPane).toContain("RECRUITER summary"); // fall-through
      expect(engineerPane).toContain("RECRUITER deep dive"); // fall-through
    });
  });

  describe("label prop", () => {
    it("renders the default label", () => {
      const html = renderToggle(engineerFull);
      expect(html).toContain("View as");
    });

    it("suppresses the label when null is passed", () => {
      const html = renderToStaticMarkup(
        <NarrativeViewToggle
          recruiter={recruiter}
          engineer={engineerFull}
          scopeId="x"
          label={null}
        >
          {() => <p>x</p>}
        </NarrativeViewToggle>
      );
      expect(html).not.toContain("View as");
      expect(html).not.toContain("pwb-narrative-toggle-label");
    });
  });
});
