import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectDetailProps {
  project: Project;
}

/**
 * Phase 7 — Research template ProjectDetail.
 *
 * Reads like a brief paper / case-study: title, abstract (description),
 * uppercase section headers, dense prose, link back to the index. No
 * cards, no badges, no big chrome.
 */
export function ProjectDetail({ project }: ProjectDetailProps) {
  return (
    <div className="container">
      <div className="project-section">
        <h1>{project.name}</h1>
        {project.description && (
          <p style={{ fontSize: "1.05rem" }}>{project.description}</p>
        )}
        <p className="project-meta">
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          {project.metadata.language && <span>{project.metadata.language}</span>}
          {project.metadata.stars !== undefined &&
            project.metadata.stars > 0 && (
              <span>★ {project.metadata.stars}</span>
            )}
          {project.metadata.license && (
            <span>{project.metadata.license}</span>
          )}
        </p>
      </div>

      {project.techStack.length > 0 && (
        <div className="project-section">
          <h3>Stack</h3>
          <p className="skills-inline">
            {project.techStack.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </p>
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

      {project.facts.length > 0 && (
        <div className="project-section">
          <h3>Verified facts</h3>
          <ul className="facts-list">
            {project.facts.map((fact, i) => (
              <li key={i}>{fact.claim}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ marginTop: "2.5em" }}>
        <a href="/projects/">← All projects</a>
      </p>
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
