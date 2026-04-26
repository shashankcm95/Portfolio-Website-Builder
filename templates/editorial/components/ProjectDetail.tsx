import React from "react";
import type { Project } from "@/templates/_shared/types";
import { CredibilityByline } from "@/templates/_shared/credibility-byline";
import { ProjectDemos } from "@/templates/_shared/project-demos";
import { StoryboardCards } from "@/templates/_shared/storyboard-cards";
import { EvidenceList } from "@/templates/_shared/evidence-list";

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

        {project.sections.architecture && (
          <div className="project-section">
            <h3>Architecture</h3>
            <div
              dangerouslySetInnerHTML={{
                __html: formatSectionContent(project.sections.architecture),
              }}
            />
          </div>
        )}

        {project.sections.techNarrative && (
          <div className="project-section">
            <h3>Technical narrative</h3>
            <div
              dangerouslySetInnerHTML={{
                __html: formatSectionContent(project.sections.techNarrative),
              }}
            />
          </div>
        )}

        {project.sections.recruiterPitch && (
          <div className="project-section">
            <h3>Why it matters</h3>
            <div
              dangerouslySetInnerHTML={{
                __html: formatSectionContent(project.sections.recruiterPitch),
              }}
            />
          </div>
        )}

        {project.sections.engineerDeepDive && (
          <div className="project-section">
            <h3>Deep dive</h3>
            <div
              dangerouslySetInnerHTML={{
                __html: formatSectionContent(project.sections.engineerDeepDive),
              }}
            />
          </div>
        )}

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
