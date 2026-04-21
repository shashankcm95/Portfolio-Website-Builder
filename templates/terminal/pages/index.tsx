import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";

interface HomePageProps {
  profileData: ProfileData;
}

export function HomePage({ profileData }: HomePageProps) {
  const { projects } = profileData;
  const featured = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const list = (featured.length > 0 ? featured : projects).slice(0, 6);

  return (
    <div>
      <Hero basics={profileData.basics} />

      {list.length > 0 && (
        <section className="section">
          <div className="container">
            <p className="prompt">ls -la projects/</p>
            <div className="ls-listing">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            {projects.length > list.length && (
              <p style={{ marginTop: "0.6em" }}>
                <a href="/projects/">→ ls projects/ ({projects.length})</a>
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
