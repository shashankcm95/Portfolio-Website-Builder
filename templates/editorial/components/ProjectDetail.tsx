import React from "react";
import type { Project } from "@/templates/_shared/types";
import { CredibilityByline } from "@/templates/_shared/credibility-byline";
import { ProjectDemos } from "@/templates/_shared/project-demos";
import { StoryboardCards } from "@/templates/_shared/storyboard-cards";
import { EvidenceList } from "@/templates/_shared/evidence-list";
import { NarrativeViewToggle } from "@/templates/_shared/narrative-view-toggle";
import { VerifiedNarrative } from "@/templates/_shared/verified-narrative";

interface ProjectDetailProps {
  project: Project;
}

/**
 * Phase 7 — Editorial ProjectDetail. Display-face title hero, then
 * structured prose sections with sans-serif eyebrow labels.
 */
export function ProjectDetail({ project }: ProjectDetailProps) {
  const meta: React.ReactNode[] = [];
  if (project.metadata.lastUpdated) {
    meta.push(<span key="year">{new Date(project.metadata.lastUpdated).getFullYear()}</span>);
  }
  if (project.metadata.language) meta.push(<span key="lang">{project.metadata.language}</span>);
  if (project.metadata.stars && project.metadata.stars > 0) {
    meta.push(<span key="stars">★ {project.metadata.stars}</span>);
  }
  if (project.metadata.license) meta.push(<span key="lic">{project.metadata.license}</span>);

  return (
    <div>
      <section className="project-hero">
        <div className="container-narrow">
          <h1>{project.name}</h1>
          {project.description && (
            <p className="project-hero-desc">{project.description}</p>
          )}
          {meta.length > 0 && <p className="project-meta">{meta}</p>}
          <p style={{ marginTop: "20px" }}>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub →
            </a>
          </p>
        </div>
      </section>

      <div className="container-narrow">
        <CredibilityByline credibility={project.credibility} />

        <ProjectDemos demos={project.demos} />

        {project.techStack.length > 0 && (
          <div className="project-section">
            <h3>Stack</h3>
            <p>{project.techStack.join(" · ")}</p>
          </div>
        )}

        {/* Phase E4 — toggle + sentence-level ticks. */}
        <NarrativeViewToggle
          recruiter={project.sections}
          engineer={project.engineerSections}
          scopeId={project.id}
        >
          {(sections, variant) => {
            const verif = project.verifiedSentences?.[variant];
            return (
              <>
                {sections.architecture && (
                  <div className="project-section">
                    <h3>Architecture</h3>
                    <VerifiedNarrative
                      text={sections.architecture}
                      verifications={verif?.architecture}
                    />
                  </div>
                )}
                {sections.techNarrative && (
                  <div className="project-section">
                    <h3>Technical narrative</h3>
                    <VerifiedNarrative
                      text={sections.techNarrative}
                      verifications={verif?.techNarrative}
                    />
                  </div>
                )}
                {sections.recruiterPitch && (
                  <div className="project-section">
                    <h3>Why it matters</h3>
                    <VerifiedNarrative
                      text={sections.recruiterPitch}
                      verifications={verif?.recruiterPitch}
                    />
                  </div>
                )}
                {sections.engineerDeepDive && (
                  <div className="project-section">
                    <h3>Deep dive</h3>
                    <VerifiedNarrative
                      text={sections.engineerDeepDive}
                      verifications={verif?.engineerDeepDive}
                    />
                  </div>
                )}
              </>
            );
          }}
        </NarrativeViewToggle>

        <StoryboardCards storyboard={project.storyboard} />

        <EvidenceList facts={project.facts} heading="Verified facts" />

        <p style={{ marginTop: "3em" }}>
          <a href="/projects/">← All work</a>
        </p>
      </div>
    </div>
  );
}

function formatSectionContent(content: string): string {
  return content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
