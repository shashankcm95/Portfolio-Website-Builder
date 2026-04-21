import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectDetailProps {
  project: Project;
}

/**
 * Phase 7 — Terminal ProjectDetail. Each section frames as `cat
 * <section>.md` followed by the rendered prose.
 */
export function ProjectDetail({ project }: ProjectDetailProps) {
  return (
    <div className="container">
      <p className="prompt">cd {project.name}</p>
      <h1>{project.name}</h1>
      {project.description && <p style={{ color: "var(--text-dim)" }}># {project.description}</p>}

      <p style={{ marginTop: "8px" }}>
        <a
          href={project.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          git@github.com:{project.repoUrl.replace(/^https?:\/\/github\.com\//, "")}
        </a>
      </p>

      {project.techStack.length > 0 && (
        <div className="project-section">
          <p className="prompt">cat stack.json</p>
          <div className="tag-group">
            {project.techStack.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>
      )}

      {project.sections.architecture && (
        <div className="project-section">
          <p className="prompt">cat architecture.md</p>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.architecture),
            }}
          />
        </div>
      )}

      {project.sections.techNarrative && (
        <div className="project-section">
          <p className="prompt">cat narrative.md</p>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.techNarrative),
            }}
          />
        </div>
      )}

      {project.sections.engineerDeepDive && (
        <div className="project-section">
          <p className="prompt">cat deep-dive.md</p>
          <div
            dangerouslySetInnerHTML={{
              __html: formatSectionContent(project.sections.engineerDeepDive),
            }}
          />
        </div>
      )}

      {project.facts.length > 0 && (
        <div className="project-section">
          <p className="prompt">grep -h '^Fact:' notes/</p>
          <ul className="facts-list">
            {project.facts.map((f, i) => (
              <li key={i}>{f.claim}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ marginTop: "2.5em" }}>
        <a href="/projects/">cd ..</a>
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
