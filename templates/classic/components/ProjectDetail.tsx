import React from "react";
import type { Project } from "@/templates/_shared/types";

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

      {/* Architecture */}
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

      {/* Technical Narrative */}
      {project.sections.techNarrative && (
        <div className="project-section">
          <h3>Technical Narrative</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.techNarrative),
            }}
          />
        </div>
      )}

      {/* Recruiter Pitch */}
      {project.sections.recruiterPitch && (
        <div className="project-section">
          <h3>Why This Project Matters</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.recruiterPitch),
            }}
          />
        </div>
      )}

      {/* Engineer Deep Dive */}
      {project.sections.engineerDeepDive && (
        <div className="project-section">
          <h3>Deep Dive</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.engineerDeepDive),
            }}
          />
        </div>
      )}

      {/* Facts */}
      {project.facts.length > 0 && (
        <div className="project-section">
          <h3>Key Facts</h3>
          <ul className="facts-list">
            {project.facts.map((fact, index) => (
              <li key={index}>
                <span>{fact.claim}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
