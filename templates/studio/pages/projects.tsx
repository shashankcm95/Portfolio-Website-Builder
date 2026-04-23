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
    <section className="section">
      <div className="container">
        <div className="section-header">
          <h2>All work</h2>
          <p>Each project below links to a full case study.</p>
        </div>
        {sorted.length === 0 ? (
          <p className="prose">No projects to display yet.</p>
        ) : (
          <ul className="project-grid">
            {sorted.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
