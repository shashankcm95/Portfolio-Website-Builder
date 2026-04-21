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
        <h2>Projects</h2>
        {sorted.length === 0 ? (
          <p>No projects to display yet.</p>
        ) : (
          <ul className="project-list">
            {sorted.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
