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
        <p className="prompt">ls -la projects/</p>
        {sorted.length === 0 ? (
          <p style={{ color: "var(--text-dim)" }}>
            # total 0
            <br /># nothing here yet.
          </p>
        ) : (
          <div className="ls-listing">
            {sorted.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
