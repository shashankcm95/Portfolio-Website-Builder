import React from "react";
import type { Project } from "@/templates/_shared/types";

interface ProjectCardProps {
  project: Project;
  num: number;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Signal project card.
 *
 * Layout: a numbered index label on the left, body on the right. Hovering
 * the whole card lifts a subtle surface + border; the title's arrow
 * glyph reveals on hover (no layout shift — reserved via `transform`).
 *
 * The card surfaces *only* fields that exist:
 *   - characterization (Phase 8 byline) under the title when present
 *   - outcomes as numeric pills — Phase B anchor evidence
 *   - tech stack as small tags (not logo grid)
 * Every element is conditional; a bare project with only name + summary
 * still renders cleanly.
 */
export function ProjectCard({ project, num }: ProjectCardProps) {
  const slug = slugify(project.name);
  const href = `/projects/${slug}/`;
  const blurb = project.sections.summary || project.description;

  return (
    <li className="case-card">
      <div className="case-num">{String(num).padStart(2, "0")}</div>
      <div className="case-body">
        <h3 className="case-title">
          <a href={href}>{project.name}</a>
        </h3>

        {project.characterization && (
          <p className="case-byline">{project.characterization}</p>
        )}

        {blurb && <p className="case-desc">{blurb}</p>}

        {project.outcomes && project.outcomes.length > 0 && (
          <ul className="case-outcomes" aria-label="Project outcomes">
            {project.outcomes.map((o, i) => (
              <li className="outcome-pill" key={`${o.metric}-${i}`}>
                <b>{o.value}</b>
                <span>{o.metric}</span>
              </li>
            ))}
          </ul>
        )}

        {project.techStack.length > 0 && (
          <ul className="case-tags" aria-label="Tech stack">
            {project.techStack.slice(0, 8).map((t) => (
              <li key={t} className="case-tag">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
