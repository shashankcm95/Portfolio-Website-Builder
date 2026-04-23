import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { TestimonialsBlock } from "@/templates/_shared/testimonials-block";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Editorial home: hero + numbered case-study list of selected work.
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
            <div className="section-header">
              <p className="section-eyebrow">Selected work</p>
              <h2>Recent case studies</h2>
            </div>
            <ol className="case-list">
              {list.map((p, i) => (
                <ProjectCard key={p.id} project={p} num={i + 1} />
              ))}
            </ol>
            {projects.length > list.length && (
              <p style={{ marginTop: "2em" }}>
                <a href="/projects/">All work →</a>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Phase R4 — testimonials rendered as italic pull-quotes. */}
      <TestimonialsBlock
        testimonials={profileData.testimonials ?? []}
        heading="What collaborators say"
      />
    </div>
  );
}
