import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
}

/**
 * Phase 7 — Terminal ProjectCard. Renders as one row of `ls -la` —
 * permission column (drwx for "directory"), name, size (chip count),
 * mtime (last update). Description below in dim prose.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const mtime = project.metadata.lastUpdated
    ? new Date(project.metadata.lastUpdated)
    : null;
  const mtimeStr = mtime
    ? `${mtime.toLocaleString("en-US", { month: "short" })} ${mtime
        .getDate()
        .toString()
        .padStart(2, " ")} ${mtime.getFullYear()}`
    : "—";
  const sizeStr = `${(project.techStack.length || 0).toString()}t`;

  return (
    <>
      <div className="ls-row">
        <span className="ls-perm">drwxr-xr-x</span>
        <span className="ls-name">
          <a href={`/projects/${slug}/`}>{project.name}/</a>
        </span>
        <span className="ls-size">{sizeStr}</span>
        <span className="ls-mtime">{mtimeStr}</span>
      </div>
      {/* Phase 8 — optional characterization byline, styled as a shell comment
       *   to blend with the terminal aesthetic. Baked at generation time. */}
      {project.characterization ? (
        <div
          className="ls-characterization"
          style={{
            color: "#75715e",
            fontStyle: "italic",
            fontSize: "0.85em",
          }}
        >
          # {project.characterization}
        </div>
      ) : null}
      {project.description && (
        <div className="ls-desc"># {project.description}</div>
      )}
    </>
  );
}
