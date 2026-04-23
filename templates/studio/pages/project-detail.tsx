import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectDetailPageProps {
  project: Project;
}

export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  const { sections } = project;

  return (
    <article className="section">
      <div className="container">
        <div className="section-header">
          <h2>{project.name}</h2>
          {project.characterization && <p>{project.characterization}</p>}
        </div>

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

        <div className="prose">
          {sections.summary && <p>{sections.summary}</p>}
          {sections.architecture && (
            <>
              <h3>Architecture</h3>
              <p>{sections.architecture}</p>
            </>
          )}
          {sections.recruiterPitch && (
            <>
              <h3>In a nutshell</h3>
              <p>{sections.recruiterPitch}</p>
            </>
          )}
          {sections.engineerDeepDive && (
            <>
              <h3>Technical detail</h3>
              <p>{sections.engineerDeepDive}</p>
            </>
          )}
        </div>

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
