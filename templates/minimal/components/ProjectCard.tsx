import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
}

/**
 * Project card for the projects listing page.
 * Shows name, description, tech stack, and GitHub stats.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div className="card">
      <h3 className="card-title">
        <a href={`/projects/${slug}/`}>{project.name}</a>
      </h3>
      <p className="card-description">{project.description}</p>

      {/* Tech Stack */}
      {project.techStack.length > 0 && (
        <div className="badge-group">
          {project.techStack.slice(0, 6).map((tech) => (
            <span key={tech} className="badge">
              {tech}
            </span>
          ))}
          {project.techStack.length > 6 && (
            <span className="badge badge-outline">
              +{project.techStack.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Footer with stats */}
      <div className="card-footer">
        <div className="project-stat">
          {project.metadata.language && (
            <span>{project.metadata.language}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          {project.metadata.stars !== undefined &&
            project.metadata.stars > 0 && (
              <span className="project-stat">
                &#9733; {project.metadata.stars}
              </span>
            )}
          {project.metadata.forks !== undefined &&
            project.metadata.forks > 0 && (
              <span className="project-stat">
                &#9413; {project.metadata.forks}
              </span>
            )}
        </div>
      </div>
    </div>
  );
}
