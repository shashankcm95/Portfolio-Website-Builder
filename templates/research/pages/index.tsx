import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Phase 7 — Research home: hero + a single "Selected work" list. The
 * full list is one click away on /projects/.
 */
export function HomePage({ profileData }: HomePageProps) {
  const { projects } = profileData;
  const featured = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const list = (featured.length > 0 ? featured : projects).slice(0, 5);

  return (
    <div>
      <Hero basics={profileData.basics} />

      {list.length > 0 && (
        <section className="section">
          <div className="container">
            <h2>Selected work</h2>
            <ul className="project-list">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </ul>
            {projects.length > list.length && (
              <p style={{ marginTop: "1em" }}>
                <a href="/projects/">All {projects.length} projects →</a>
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
