import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
  /** 1-indexed case number; passed by parent so it's stable. */
  num: number;
}

/**
 * Phase 7 — Editorial ProjectCard.
 *
 * Numbered case-study row: number column / body / side meta.
 * Renders as a `<li>` so the parent `<ol>` provides semantic ordering.
 */
export function ProjectCard({ project, num }: ProjectCardProps) {
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const year = project.metadata.lastUpdated
    ? new Date(project.metadata.lastUpdated).getFullYear().toString()
    : "";
  const techShort = project.techStack.slice(0, 5).join(" · ");

  return (
    <li className="case-item">
      <span className="case-num">{num.toString().padStart(2, "0")}</span>
      <div className="case-body">
        <h3 className="case-title">
          <a href={`/projects/${slug}/`}>{project.name}</a>
        </h3>
        {/* Phase 8 — optional characterization byline (baked, no runtime call) */}
        {project.characterization ? (
          <p
            className="case-characterization"
            style={{
              fontSize: "0.8rem",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              color: "#ff3c00",
              marginTop: "-0.25rem",
              marginBottom: "0.5rem",
            }}
          >
            {project.characterization}
          </p>
        ) : null}
        {project.description && (
          <p className="case-desc">{project.description}</p>
        )}
        {techShort && <p className="case-tech">{techShort}</p>}
      </div>
      <div className="case-side">
        {year && <div>{year}</div>}
        {project.metadata.language && <div>{project.metadata.language}</div>}
        {project.metadata.stars !== undefined &&
          project.metadata.stars > 0 && (
            <div>★ {project.metadata.stars}</div>
          )}
      </div>
    </li>
  );
}
