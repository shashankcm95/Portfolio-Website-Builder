import React from "react";
import type { Project } from "@/templates/_shared/types";
import { CredibilityByline } from "@/templates/_shared/credibility-byline";
import { ProjectDemos } from "@/templates/_shared/project-demos";
import { StoryboardCards } from "@/templates/_shared/storyboard-cards";
import { EvidenceList } from "@/templates/_shared/evidence-list";
import { NarrativeViewToggle } from "@/templates/_shared/narrative-view-toggle";

interface ProjectDetailPageProps {
  project: Project;
}

/**
 * Detail view for a single project. Surfaces every narrative section that
 * exists (engineer variant preferred for detail page), plus outcomes +
 * full tech stack. Falls back gracefully when sections are unset.
 *
 * Phase E2 — Signal is the lead template for the proof-backed surfacing
 * upgrade. Visitors now see, in order:
 *
 *   1. Title + the (existing) characterization byline
 *   2. Credibility chips (category, contributors, CI/Tests/Releases ticks,
 *      live link) — one-line proof of "this is a real project"
 *   3. Outcome pills (existing)
 *   4. Project demos — Loom / YouTube / image slideshow rendered inline,
 *      JS-free
 *   5. Prose narrative (existing summary / architecture / stack / deep-dive)
 *   6. Guided tour — the verified 6-card storyboard (what / how / file /
 *      tested / deploys / try it) with per-claim verifier markers
 *   7. Tech stack tags (existing)
 *   8. Verified facts list — every extracted fact with its evidence trail
 *      behind a `<details>` disclosure
 *   9. View-repository link (existing)
 *
 * Every new block is conditional on its data being present, so projects
 * predating any of the pipeline steps render cleanly without empty
 * placeholders.
 */
export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return (
    <article>
      <div className="section-head">
        <span className="section-eyebrow">Case study</span>
        <h2>{project.name}</h2>
      </div>

      {project.characterization && (
        <p className="case-byline" style={{ marginTop: "-16px" }}>
          {project.characterization}
        </p>
      )}

      <CredibilityByline credibility={project.credibility} />

      {project.outcomes && project.outcomes.length > 0 && (
        <ul
          className="case-outcomes"
          aria-label="Project outcomes"
          style={{ margin: "20px 0 28px" }}
        >
          {project.outcomes.map((o, i) => (
            <li className="outcome-pill" key={`${o.metric}-${i}`}>
              <b>{o.value}</b>
              <span>{o.metric}</span>
            </li>
          ))}
        </ul>
      )}

      <ProjectDemos demos={project.demos} />

      {/* Phase E4 — NarrativeViewToggle wraps the prose. When the project
          carries an engineer variant, visitors get a CSS-only toggle to
          swap between recruiter and engineer copy. When it doesn't, the
          component renders only the recruiter prose without any toggle UI. */}
      <NarrativeViewToggle
        recruiter={project.sections}
        engineer={project.engineerSections}
        scopeId={project.id}
      >
        {(sections) => (
          <div className="prose">
            {sections.summary && <p>{sections.summary}</p>}

            {sections.architecture && (
              <>
                <h3>Architecture</h3>
                <p>{sections.architecture}</p>
              </>
            )}

            {sections.techNarrative && (
              <>
                <h3>Stack</h3>
                <p>{sections.techNarrative}</p>
              </>
            )}

            {sections.engineerDeepDive && (
              <>
                <h3>Deep dive</h3>
                <p>{sections.engineerDeepDive}</p>
              </>
            )}
          </div>
        )}
      </NarrativeViewToggle>

      <StoryboardCards storyboard={project.storyboard} />

      {project.techStack.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: "48px" }}>
            <span className="section-eyebrow">Built with</span>
          </div>
          <ul className="case-tags" aria-label="Tech stack">
            {project.techStack.map((t) => (
              <li key={t} className="case-tag">
                {t}
              </li>
            ))}
          </ul>
        </>
      )}

      <EvidenceList facts={project.facts} heading="Verified facts" />

      {project.repoUrl && (
        <p style={{ marginTop: "40px" }}>
          <a
            className="contact-link"
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View repository ↗
          </a>
        </p>
      )}
    </article>
  );
}
