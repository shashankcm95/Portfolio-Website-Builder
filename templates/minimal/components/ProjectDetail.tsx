import React from "react";
import type { Project } from "@/templates/_shared/types";
import { CredibilityByline } from "@/templates/_shared/credibility-byline";
import { ProjectDemos } from "@/templates/_shared/project-demos";
import { StoryboardCards } from "@/templates/_shared/storyboard-cards";
import { EvidenceList } from "@/templates/_shared/evidence-list";
import { NarrativeViewToggle } from "@/templates/_shared/narrative-view-toggle";

interface ProjectDetailProps {
  project: Project;
}

/**
 * Full project detail page content.
 * Displays name, description, tech stack, AI-generated sections, facts, and metadata.
 */
export function ProjectDetail({ project }: ProjectDetailProps) {
  return (
    <div className="container container-narrow">
      {/* Project Header */}
      <div className="project-header">
        <h1>{project.name}</h1>
        <p>{project.description}</p>

        <div className="project-meta">
          <a
            href={project.repoUrl}
            className="btn btn-outline"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          {project.metadata.language && (
            <span className="project-stat">{project.metadata.language}</span>
          )}
          {project.metadata.stars !== undefined &&
            project.metadata.stars > 0 && (
              <span className="project-stat">
                &#9733; {project.metadata.stars} stars
              </span>
            )}
          {project.metadata.forks !== undefined &&
            project.metadata.forks > 0 && (
              <span className="project-stat">
                &#9413; {project.metadata.forks} forks
              </span>
            )}
          {project.metadata.license && (
            <span className="project-stat">{project.metadata.license}</span>
          )}
        </div>
      </div>

      {/* Phase E3 — credibility byline + demos */}
      <CredibilityByline credibility={project.credibility} />

      <ProjectDemos demos={project.demos} />

      {/* Tech Stack */}
      {project.techStack.length > 0 && (
        <div className="project-section">
          <h3>Tech Stack</h3>
          <div className="badge-group">
            {project.techStack.map((tech) => (
              <span key={tech} className="badge">
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Phase E4 — toggle wrapper around all four narrative sections. */}
      <NarrativeViewToggle
        recruiter={project.sections}
        engineer={project.engineerSections}
        scopeId={project.id}
      >
        {(sections) => (
          <>
            {sections.architecture && (
              <div className="project-section">
                <h3>Architecture</h3>
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatSectionContent(sections.architecture),
                  }}
                />
              </div>
            )}
            {sections.techNarrative && (
              <div className="project-section">
                <h3>Technical Narrative</h3>
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatSectionContent(sections.techNarrative),
                  }}
                />
              </div>
            )}
            {sections.recruiterPitch && (
              <div className="project-section">
                <h3>Why This Project Matters</h3>
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatSectionContent(sections.recruiterPitch),
                  }}
                />
              </div>
            )}
            {sections.engineerDeepDive && (
              <div className="project-section">
                <h3>Deep Dive</h3>
                <div
                  dangerouslySetInnerHTML={{
                    __html: formatSectionContent(sections.engineerDeepDive),
                  }}
                />
              </div>
            )}
          </>
        )}
      </NarrativeViewToggle>

      {/* Phase E3 — guided tour + evidence-rich facts */}
      <StoryboardCards storyboard={project.storyboard} />

      <EvidenceList facts={project.facts} heading="Key facts" />

      {/* Back to Projects */}
      <div className="mt-8">
        <a href="/projects/" className="btn btn-outline">
          &larr; Back to Projects
        </a>
      </div>
    </div>
  );
}

/**
 * Convert plain-text section content into HTML paragraphs.
 * Handles newline-separated paragraphs.
 */
function formatSectionContent(content: string): string {
  return content
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
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
