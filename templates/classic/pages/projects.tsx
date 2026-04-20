import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { ProjectCard } from "../components/ProjectCard";

interface ProjectsPageProps {
  profileData: ProfileData;
}

/**
 * Projects listing page showing all projects.
 */
export function ProjectsPage({ profileData }: ProjectsPageProps) {
  const sortedProjects = [...profileData.projects].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return (
    <section className="section">
      <div className="container">
        <div className="section-header">
          <h2>Projects</h2>
          <p>
            All of my open-source projects and technical work
          </p>
        </div>
        {sortedProjects.length > 0 ? (
          <div className="grid grid-3">
            {sortedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted">
            No projects to display yet.
          </p>
        )}
      </div>
    </section>
  );
}
