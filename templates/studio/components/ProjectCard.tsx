import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function ProjectCard({ project }: ProjectCardProps) {
  const slug = slugify(project.name);
  const href = `/projects/${slug}/`;
  const blurb = project.sections.summary || project.description;

  return (
    <li className="project-card">
      <h3>
        <a href={href}>{project.name}</a>
      </h3>
      {project.characterization && (
        <p className="project-byline">{project.characterization}</p>
      )}
      {blurb && <p className="desc">{blurb}</p>}
      {project.outcomes && project.outcomes.length > 0 && (
        <ul className="outcome-row">
          {project.outcomes.map((o, i) => (
            <li className="outcome-chip" key={`${o.metric}-${i}`}>
              <b>{o.value}</b>
              <span>{o.metric}</span>
            </li>
          ))}
        </ul>
      )}
      {project.techStack.length > 0 && (
        <ul className="tech-row">
          {project.techStack.slice(0, 6).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
