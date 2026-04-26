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

      {/* Phase E3 — research voice is academic-quiet, so the credibility
          byline reads as a single inline metadata paragraph rather than
          a row of decorated chips. The shared CSS keeps it lowercase and
          comma-feeling. */}
      <CredibilityByline credibility={project.credibility} />

      <ProjectDemos demos={project.demos} heading="Figure" />

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

      {/* Phase E3 — guided tour rendered as a numbered list of paragraphs,
          and a verified-facts block with evidence trail behind <details>. */}
      <StoryboardCards storyboard={project.storyboard} heading="Tour" diagramHeading="Architecture diagram" />

      <EvidenceList facts={project.facts} heading="Verified facts" />

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
