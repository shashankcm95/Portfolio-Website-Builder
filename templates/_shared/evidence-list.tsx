import React from "react";
import type { ProjectFact } from "./types";

interface EvidenceListProps {
  facts: ProjectFact[] | undefined;
  /**
   * Heading copy. Defaults to "Key facts" — templates with a more
   * formal voice can override ("Project facts", "Verified facts", etc.).
   * Pass `null` to suppress the heading entirely (terminal template
   * already prints its own `grep` prompt above the list).
   */
  heading?: string | null;
  /**
   * Render only this many facts. Defaults to 8 — enough to cover the
   * meaningful signal without becoming a wall. Pass Infinity to disable.
   */
  limit?: number;
  /**
   * When true, only facts with `isVerified === true` are shown. Defaults
   * false (renders every fact, with a small ✓ next to verified ones).
   * Templates that lean academic-quiet can opt into the strict mode.
   */
  verifiedOnly?: boolean;
}

/**
 * Phase E2 — Render each fact with its full evidence trail behind a
 * `<details>` disclosure. The pipeline already extracts facts with
 * `evidenceType` (where it came from), `evidenceText` (the verbatim
 * source quote), and `isVerified` (verifier passed) — but pre-E2
 * templates only rendered the `claim` text, throwing the citation
 * away. This component flips that on.
 *
 * The `<details>` element is the right primitive: zero JS, native
 * keyboard support, screen-reader friendly, and degrades gracefully on
 * the very oldest browsers (the entire content stays visible).
 *
 * Returns null when there's nothing to render — facts undefined, empty,
 * or filtered out by `verifiedOnly`.
 */
export function EvidenceList({
  facts,
  heading = "Key facts",
  limit = 8,
  verifiedOnly = false,
}: EvidenceListProps) {
  if (!facts || facts.length === 0) return null;

  const filtered = verifiedOnly
    ? facts.filter((f) => f.isVerified === true)
    : facts;

  if (filtered.length === 0) return null;

  // Show distinct claims first, sorted by confidence (descending) so
  // the strongest signals lead. Stable across renders because we don't
  // mutate the input array.
  const sorted = [...filtered].sort((a, b) => {
    const ac = typeof a.confidence === "number" ? a.confidence : 0.5;
    const bc = typeof b.confidence === "number" ? b.confidence : 0.5;
    return bc - ac;
  });

  const truncated = sorted.slice(0, Number.isFinite(limit) ? limit : sorted.length);

  return (
    <section
      className="pwb-evidence-list"
      aria-label={heading ?? "Verified facts"}
    >
      {heading && <h3 className="pwb-evidence-heading">{heading}</h3>}
      <ul className="pwb-evidence-items">
        {truncated.map((f, i) => (
          <li key={`${f.claim}-${i}`} className="pwb-evidence-item">
            <EvidenceItem fact={f} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Single fact + evidence trail. Exported so individual templates can
 * use it inline (e.g. as a footnote inside a narrative paragraph)
 * without rendering the full list.
 */
export function EvidenceItem({ fact }: { fact: ProjectFact }) {
  const hasEvidence =
    (typeof fact.evidenceText === "string" && fact.evidenceText.length > 0) ||
    (typeof fact.evidenceRef === "string" && fact.evidenceRef.length > 0);

  return (
    <div className="pwb-evidence-claim">
      <div className="pwb-evidence-claim-line">
        {fact.isVerified === true && (
          <span
            className="pwb-evidence-tick"
            aria-label="Verified by the pipeline"
            title="This claim has been verified against the source"
          >
            ✓
          </span>
        )}
        <span className="pwb-evidence-claim-text">{fact.claim}</span>
        {fact.evidenceType && (
          <span
            className="pwb-evidence-source"
            title={`Evidence type: ${fact.evidenceType}`}
          >
            {formatEvidenceType(fact.evidenceType)}
          </span>
        )}
      </div>
      {hasEvidence && (
        <details className="pwb-evidence-details">
          <summary className="pwb-evidence-summary">Evidence</summary>
          <div className="pwb-evidence-body">
            {fact.evidenceText && (
              <blockquote className="pwb-evidence-quote">
                {fact.evidenceText}
              </blockquote>
            )}
            {fact.evidenceRef && (
              <p className="pwb-evidence-ref">
                <span className="pwb-evidence-ref-label">Source:</span>{" "}
                <code>{fact.evidenceRef}</code>
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Map the raw `evidenceType` string from the pipeline into a short
 * human-readable badge. Unknown types fall through to the raw string
 * so we surface signal even when the pipeline emits a new type before
 * this map gets updated.
 */
function formatEvidenceType(type: string): string {
  switch (type) {
    case "repo_file":
      return "from code";
    case "readme":
      return "from README";
    case "dependency":
      return "from package.json";
    case "resume":
      return "from resume";
    case "inferred":
      return "inferred";
    default:
      return type.replace(/_/g, " ");
  }
}
