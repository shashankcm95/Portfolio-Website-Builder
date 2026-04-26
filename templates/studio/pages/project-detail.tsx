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

export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return (
    <article className="section">
      <div className="container">
        <div className="section-header">
          <h2>{project.name}</h2>
          {project.characterization && <p>{project.characterization}</p>}
        </div>

        <CredibilityByline credibility={project.credibility} />

        {project.outcomes && project.outcomes.length > 0 && (
          <ul className="outcome-row" style={{ marginBottom: "32px" }}>
            {project.outcomes.map((o, i) => (
              <li className="outcome-chip" key={`${o.metric}-${i}`}>
                <b>{o.value}</b>
                <span>{o.metric}</span>
              </li>
            ))}
          </ul>
        )}

        <ProjectDemos demos={project.demos} />

        {/* Phase E4 — toggle wrapper around the prose pane. */}
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
                {sections.recruiterPitch && <h3>In a nutshell</h3>}
                <VerifiedNarrative
                  text={sections.recruiterPitch}
                  verifications={verif?.recruiterPitch}
                />
                {sections.engineerDeepDive && <h3>Technical detail</h3>}
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
            <div className="section-header" style={{ marginTop: "48px" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Built with</h2>
            </div>
            <ul className="tech-row">
              {project.techStack.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}

        <EvidenceList facts={project.facts} heading="Verified facts" />

        {project.repoUrl && (
          <p style={{ marginTop: "32px" }}>
            <a
              className="btn-ghost"
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View repository →
            </a>
          </p>
        )}
      </div>
    </article>
  );
}
