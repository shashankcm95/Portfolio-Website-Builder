import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { ProjectCard } from "../components/ProjectCard";

interface ProjectsPageProps {
  profileData: ProfileData;
}

export function ProjectsPage({ profileData }: ProjectsPageProps) {
  const sorted = [...profileData.projects].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return (
    <section aria-label="All projects">
      <div className="section-head">
        <span className="section-eyebrow">Index</span>
        <h2>All work</h2>
      </div>
      {sorted.length === 0 ? (
        <p className="prose">No projects to display yet.</p>
      ) : (
        <ol className="case-list">
          {sorted.map((p, i) => (
            <ProjectCard key={p.id} project={p} num={i + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}
