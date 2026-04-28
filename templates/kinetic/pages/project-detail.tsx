import React from "react";
import type { Project } from "@/templates/_shared/types";
import { CredibilityByline } from "@/templates/_shared/credibility-byline";
import { ProjectDemos } from "@/templates/_shared/project-demos";
import { StoryboardCards } from "@/templates/_shared/storyboard-cards";
import { EvidenceList } from "@/templates/_shared/evidence-list";
import { NarrativeViewToggle } from "@/templates/_shared/narrative-view-toggle";
import { VerifiedNarrative } from "@/templates/_shared/verified-narrative";

interface ProjectDetailPageProps {
  project: Project;
}

/**
 * Project detail — same proof-backed surface as the signal template
 * (CredibilityByline → outcomes → demos → narrative → storyboard →
 * stack → evidence list → repo link). Kinetic styling layered on top.
 */
export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return (
    <article>
      <p className="detail-back">
        <a href="/projects/">← All work</a>
      </p>

      <div
        className="section-head animate-blur-fade-up"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        <span className="section-eyebrow">Case study</span>
        <h2>
          <em>{project.name}</em>
        </h2>
      </div>

      {project.characterization && (
        <p
          className="case-byline animate-blur-fade-up"
          style={{
            marginTop: "-16px",
            "--d": "150ms",
          } as React.CSSProperties}
        >
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

      <NarrativeViewToggle
        recruiter={project.sections}
        engineer={project.engineerSections}
        scopeId={project.id}
      >
        {(sections, variant) => {
          const verif = project.verifiedSentences?.[variant];
          return (
            <div className="prose">
              <VerifiedNarrative
                text={sections.summary}
                verifications={verif?.summary}
              />
              {sections.architecture && <h3>Architecture</h3>}
              <VerifiedNarrative
                text={sections.architecture}
                verifications={verif?.architecture}
              />
              {sections.techNarrative && <h3>Stack</h3>}
              <VerifiedNarrative
                text={sections.techNarrative}
                verifications={verif?.techNarrative}
              />
              {sections.engineerDeepDive && <h3>Deep dive</h3>}
              <VerifiedNarrative
                text={sections.engineerDeepDive}
                verifications={verif?.engineerDeepDive}
              />
            </div>
          );
        }}
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
