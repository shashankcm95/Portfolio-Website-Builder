import React from "react";
import type { Project } from "./types";

interface NarrativeViewToggleProps {
  /**
   * The recruiter-variant sections (the existing `Project.sections`).
   * Always present — every project has at least these.
   */
  recruiter: Project["sections"];
  /**
   * The engineer-variant sections. Optional — when the pipeline hasn't
   * produced engineer-variant rows yet (older projects), the toggle
   * suppresses itself and renders only the recruiter variant.
   */
  engineer: Project["engineerSections"];
  /**
   * Stable id used to scope the radio inputs' `name` attribute. Pass
   * `project.id` or any per-page-unique string. Required so multiple
   * project pages or repeated detail blocks on the same page don't
   * accidentally share state.
   */
  scopeId: string;
  /**
   * Children render the prose for the currently-selected variant. The
   * caller is given a `sections` value (either recruiter or engineer)
   * and a `variant` flag so it can wire the same `<div className="prose">`
   * once and not duplicate every section JSX block.
   *
   * The component renders the children twice — once for each variant —
   * inside two adjacent containers; the toggle's CSS swaps which
   * container is visible. This keeps the JSX site-of-use as simple as a
   * single render block while still producing the two-DOM-trees a
   * CSS-only toggle requires.
   */
  children: (
    sections: Project["sections"],
    variant: "recruiter" | "engineer"
  ) => React.ReactNode;
  /**
   * Optional eyebrow / label copy. Defaults to "View as" — templates
   * with a more formal voice can pass null to suppress the label.
   */
  label?: string | null;
}

/**
 * Phase E4 — JS-free toggle between the recruiter and engineer narrative
 * variants. Two `<input type="radio">` controls hold the selected
 * variant; sibling-selector CSS swaps which prose container is visible.
 * Zero JS dependency, native keyboard support, accessible to assistive
 * tech (radios + labels are widely understood).
 *
 * When `engineer` is undefined or carries no populated keys, the toggle
 * suppresses itself entirely and renders only the recruiter variant in
 * a single container — no orphan radio buttons.
 *
 * Class names follow the `pwb-` convention so per-template global.css
 * can theme the toggle to fit each design language.
 */
export function NarrativeViewToggle({
  recruiter,
  engineer,
  scopeId,
  children,
  label = "View as",
}: NarrativeViewToggleProps) {
  const hasEngineer =
    engineer && Object.values(engineer).some((v) => typeof v === "string" && v.length > 0);

  if (!hasEngineer) {
    // Single-variant fallback — render the recruiter variant inline,
    // no toggle UI at all. Keeps the DOM simple for projects that
    // predate the dual-variant pipeline run.
    return (
      <div className="pwb-narrative pwb-narrative-single">
        {children(recruiter, "recruiter")}
      </div>
    );
  }

  // Merge engineer-variant overrides on top of the recruiter base — for
  // sections the engineer variant didn't populate, fall through to the
  // recruiter copy so the engineer view never shows blank gaps.
  const engineerView: Project["sections"] = {
    summary: engineer?.summary ?? recruiter.summary,
    architecture: engineer?.architecture ?? recruiter.architecture,
    techNarrative: engineer?.techNarrative ?? recruiter.techNarrative,
    recruiterPitch: engineer?.recruiterPitch ?? recruiter.recruiterPitch,
    engineerDeepDive: engineer?.engineerDeepDive ?? recruiter.engineerDeepDive,
  };

  // Stable, URL-safe ids derived from the scope so multiple toggles on
  // the same document keep their own state.
  const safeScope = scopeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const recruiterId = `pwb-view-recruiter-${safeScope}`;
  const engineerId = `pwb-view-engineer-${safeScope}`;
  const groupName = `pwb-view-${safeScope}`;

  return (
    <div className="pwb-narrative pwb-narrative-toggle" data-pwb-scope={safeScope}>
      {/* The radios live BEFORE both prose containers so sibling CSS
          (`input:checked ~ .pwb-narrative-pane`) can swap visibility
          without JS. The label-as-button surface gets the visible chip
          treatment in each template's CSS. */}
      <input
        type="radio"
        name={groupName}
        id={recruiterId}
        className="pwb-narrative-radio pwb-narrative-radio-recruiter"
        defaultChecked
        aria-label="Recruiter view"
      />
      <input
        type="radio"
        name={groupName}
        id={engineerId}
        className="pwb-narrative-radio pwb-narrative-radio-engineer"
        aria-label="Engineer view"
      />
      <div
        className="pwb-narrative-toggle-row"
        role="group"
        aria-label="Narrative view selection"
      >
        {label && <span className="pwb-narrative-toggle-label">{label}</span>}
        <label
          htmlFor={recruiterId}
          className="pwb-narrative-toggle-option pwb-narrative-toggle-option-recruiter"
        >
          Recruiter
        </label>
        <label
          htmlFor={engineerId}
          className="pwb-narrative-toggle-option pwb-narrative-toggle-option-engineer"
        >
          Engineer
        </label>
      </div>
      <div className="pwb-narrative-pane pwb-narrative-pane-recruiter">
        {children(recruiter, "recruiter")}
      </div>
      <div className="pwb-narrative-pane pwb-narrative-pane-engineer">
        {children(engineerView, "engineer")}
      </div>
    </div>
  );
}
