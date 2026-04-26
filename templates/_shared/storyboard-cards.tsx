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
        <>
        <figure className="pwb-storyboard-diagram">
          <figcaption className="pwb-storyboard-diagram-summary">
            {diagramHeading}
          </figcaption>
          {/*
            Phase E5 — render the mermaid source inline, then enhance
            client-side. The `<pre class="mermaid">` is the
            mermaid library's own contract: it walks the DOM looking
            for elements with that class and replaces their text with
            an inline SVG. When mermaid.js fails to load (offline,
            CSP), the source stays visible — that's the visible-
            without-JS state.
          */}
          <pre className="mermaid pwb-storyboard-diagram-source">
            {storyboard.mermaid}
          </pre>
          {/*
            Source-fallback hint sits under the rendered diagram and
            collapses out of the way once mermaid runs. CSS hides it
            when the parent figure has the `data-pwb-mermaid-rendered`
            attribute the bootstrap script sets after a successful
            render.
          */}
          <p className="pwb-storyboard-diagram-hint">
            Diagram source rendered with{" "}
            <a
              href="https://mermaid.js.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              mermaid.js
            </a>
            .
          </p>
        </figure>
        {/*
          Phase E5 — bootstrap script. Inline because it's a few-hundred-
          byte body that only fires on pages with a storyboard diagram.
          Lazy-imports mermaid.js from a pinned CDN and renders the
          source `<pre class="mermaid">` to inline SVG.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: buildMermaidBootstrap() }}
        />
        </>
      )}
    </section>
  );
}

/**
 * Phase E5 — inline bootstrap that lazy-loads mermaid.js the first time
 * a page that contains a `<pre class="mermaid">` element is rendered.
 *
 * Returns the JS body as a string so the renderer can inject it via
 * `dangerouslySetInnerHTML` in the page footer (same pattern as the
 * Phase 8.5 chatbot bootstrap). The script:
 *
 *   - exits early if the page has no `<pre class="mermaid">` (every
 *     non-project page, plus older portfolios with no storyboard data)
 *   - dynamically imports mermaid.js from a pinned CDN URL
 *   - calls `mermaid.run()` to render every `.mermaid` element to SVG
 *   - sets `data-pwb-mermaid-rendered` on each container so CSS can
 *     hide the now-redundant source / hint
 *   - swallows errors silently — the visible-without-JS source is the
 *     fallback
 *
 * Pinning the version protects the published site from upstream
 * regressions; bumping the pin is an opt-in republish action.
 *
 * Layout.tsx of each template injects the result via
 * `dangerouslySetInnerHTML` so the script body is never re-evaluated
 * on navigation between rendered pages.
 */
export function buildMermaidBootstrap(): string {
  // Pinned to the major-stable line. Mermaid is a sizeable dep
  // (~200KB gzipped) but loads only on pages with diagrams.
  const cdn = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  return `(function(){try{if(typeof window==="undefined"||typeof document==="undefined")return;var nodes=document.querySelectorAll("pre.mermaid");if(!nodes||nodes.length===0)return;import(${JSON.stringify(cdn)}).then(function(m){var mermaid=m.default;mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"default"});mermaid.run({nodes:nodes}).then(function(){nodes.forEach(function(n){var p=n.parentElement;if(p)p.setAttribute("data-pwb-mermaid-rendered","true");});}).catch(function(){});}).catch(function(){});}catch(e){}})();`;
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
