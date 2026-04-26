import React from "react";
import type { StoryboardPayload } from "./types";

interface StoryboardCardsProps {
  storyboard: StoryboardPayload | undefined;
  /** Caption above the card grid. Defaults to "Guided tour". */
  heading?: string | null;
  /**
   * Caption above the architecture diagram block. Defaults to
   * "Architecture". Pass null to suppress the diagram entirely.
   */
  diagramHeading?: string | null;
}

/**
 * Phase E2 — Render the verified 6-card guided tour the storyboard
 * pipeline produces. Each card has a fixed slot (what / how /
 * interesting file / tested / deploys / try it) carrying a title,
 * a description, 0–3 verified claims, and an optional `extra` payload
 * (file snippet or demo URL).
 *
 * The pipeline already verifies every claim against repo state via
 * deterministic checks (dep present in package.json, glob hits in the
 * file tree, workflow category matches a CI run, regex hits in source
 * text). We surface the verifier verdict as a small ✓ or — marker so
 * the visitor sees the proof, not just the prose.
 *
 * Returns null when `storyboard` is undefined — templates can drop the
 * whole block when the pipeline hasn't produced a tour yet.
 */
export function StoryboardCards({
  storyboard,
  heading = "Guided tour",
  diagramHeading = "Architecture",
}: StoryboardCardsProps) {
  if (!storyboard) return null;

  return (
    <section className="pwb-storyboard" aria-label={heading ?? "Guided tour"}>
      {heading && <h3 className="pwb-storyboard-heading">{heading}</h3>}
      <ol className="pwb-storyboard-grid">
        {storyboard.cards.map((card, i) => (
          <li key={card.id} className="pwb-storyboard-card">
            <header className="pwb-storyboard-card-head">
              <span
                className="pwb-storyboard-card-icon"
                aria-hidden="true"
              >
                {iconForCardId(card.id)}
              </span>
              <span className="pwb-storyboard-card-num">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h4 className="pwb-storyboard-card-title">{card.title}</h4>
            </header>
            <p className="pwb-storyboard-card-desc">{card.description}</p>
            {card.claims.length > 0 && (
              <ul
                className="pwb-storyboard-claims"
                aria-label="Verified claims"
              >
                {card.claims.map((claim, ci) => (
                  <li key={ci} className="pwb-storyboard-claim">
                    <ClaimMarker status={claim.status ?? "pending"} />
                    <span className="pwb-storyboard-claim-label">
                      {claim.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {card.extra && <CardExtra extra={card.extra} />}
          </li>
        ))}
      </ol>
      {diagramHeading && storyboard.mermaid && (
        <details className="pwb-storyboard-diagram">
          <summary className="pwb-storyboard-diagram-summary">
            {diagramHeading}
          </summary>
          <pre className="pwb-storyboard-diagram-source">
            <code>{storyboard.mermaid}</code>
          </pre>
          <p className="pwb-storyboard-diagram-hint">
            Paste the source above into{" "}
            <a
              href="https://mermaid.live"
              target="_blank"
              rel="noopener noreferrer"
            >
              mermaid.live
            </a>{" "}
            to view the rendered diagram.
          </p>
        </details>
      )}
    </section>
  );
}

/**
 * Visual cue per claim. The verifier stamps `status` at runtime
 * (`verified` / `flagged` / `pending`); we surface it as a small
 * marker so the visitor knows whether each line is independently
 * proven against repo state.
 */
function ClaimMarker({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span
        className="pwb-storyboard-marker pwb-storyboard-marker-ok"
        aria-label="Verified"
        title="The verifier confirmed this claim against repo state"
      >
        ✓
      </span>
    );
  }
  if (status === "flagged") {
    return (
      <span
        className="pwb-storyboard-marker pwb-storyboard-marker-flag"
        aria-label="Flagged"
        title="The verifier could not confirm this claim"
      >
        !
      </span>
    );
  }
  return (
    <span
      className="pwb-storyboard-marker pwb-storyboard-marker-pending"
      aria-label="Pending"
      title="Verification has not run yet"
    >
      —
    </span>
  );
}

/**
 * Per-card extras. Currently two kinds:
 *   - `file_snippet` → inline code block with a path label
 *   - `demo`        → "try it" link / clone command
 *
 * The shared component renders both inline; templates that already
 * surface demos via `<ProjectDemos>` can pass `diagramHeading={null}`
 * and rely on the storyboard demo card's `try_it` content as a quick
 * link rather than the full embed.
 */
function CardExtra({
  extra,
}: {
  extra: NonNullable<StoryboardPayload["cards"][number]["extra"]>;
}) {
  if (extra.kind === "file_snippet" && extra.path && extra.snippet) {
    return (
      <div className="pwb-storyboard-snippet">
        <p className="pwb-storyboard-snippet-path">
          <code>{extra.path}</code>
        </p>
        <pre className="pwb-storyboard-snippet-code">
          <code>{extra.snippet}</code>
        </pre>
      </div>
    );
  }
  if (extra.kind === "demo") {
    return (
      <div className="pwb-storyboard-demo">
        {extra.url && (
          <a
            href={extra.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pwb-storyboard-demo-link"
          >
            Try it <span aria-hidden="true">↗</span>
          </a>
        )}
        {extra.cloneCommand && (
          <pre className="pwb-storyboard-clone">
            <code>{extra.cloneCommand}</code>
          </pre>
        )}
      </div>
    );
  }
  return null;
}

/**
 * Card IDs are a fixed enum (what / how / interesting_file / tested /
 * deploys / try_it) so we can hardcode an emoji per slot. Avoids
 * pulling lucide-react onto the published bundle just to render six
 * tiny icons. Each emoji was chosen to read well in both light and
 * dark themes.
 */
function iconForCardId(id: string): string {
  switch (id) {
    case "what":
      return "💡";
    case "how":
      return "🛠";
    case "interesting_file":
      return "📄";
    case "tested":
      return "✓";
    case "deploys":
      return "🚀";
    case "try_it":
      return "▶";
    default:
      return "•";
  }
}
