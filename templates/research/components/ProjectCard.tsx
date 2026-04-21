import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
}

/**
 * Phase 7 — Research template ProjectCard.
 *
 * Renders as a paper-style entry: title, one-line description, meta
 * line (year · stack · stars). No card chrome, just border-top
 * separators in the parent list.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const meta: string[] = [];
  if (project.metadata.language) meta.push(project.metadata.language);
  if (project.metadata.lastUpdated) {
    meta.push(new Date(project.metadata.lastUpdated).getFullYear().toString());
  }
  if (project.techStack.length > 0) {
    meta.push(project.techStack.slice(0, 4).join(" / "));
  }
  if (project.metadata.stars && project.metadata.stars > 0) {
    meta.push(`★ ${project.metadata.stars}`);
  }

  return (
    <li className="project-item">
      <h3 className="project-name">
        <a href={`/projects/${slug}/`}>{project.name}</a>
      </h3>
      {project.description && (
        <p className="project-desc">{project.description}</p>
      )}
      {meta.length > 0 && (
        <p className="project-meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </p>
      )}
    </li>
  );
}
