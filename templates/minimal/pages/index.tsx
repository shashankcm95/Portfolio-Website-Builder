import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { TestimonialsBlock } from "@/templates/_shared/testimonials-block";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Home page composing Hero + featured projects + skills overview.
 */
export function HomePage({ profileData }: HomePageProps) {
  const { basics, projects, skills } = profileData;

  // Get featured projects first, then fill with top projects by displayOrder
  const featuredProjects = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const topProjects =
    featuredProjects.length > 0
      ? featuredProjects.slice(0, 3)
      : projects.slice(0, 3);

  // Top skills for overview
  const topSkills = skills.slice(0, 12);

  return (
    <div>
      <Hero basics={basics} />

      {/* Featured Projects */}
      {topProjects.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Featured Projects</h2>
              <p>A selection of projects I have built</p>
            </div>
            <div className="grid grid-3">
              {topProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
            {projects.length > 3 && (
              <div className="text-center mt-8">
                <a href="/projects/" className="btn btn-outline">
                  View All Projects
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Phase R4 — testimonials. Already filtered by isVisible in the
          profile-data assembler; shared block handles the empty case. */}
      <TestimonialsBlock testimonials={profileData.testimonials ?? []} />

      {/* Skills Overview */}
      {topSkills.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Skills &amp; Technologies</h2>
              <p>Technologies I work with regularly</p>
            </div>
            <div className="badge-group" style={{ justifyContent: "center" }}>
              {topSkills.map((skill) => (
                <span key={skill.name} className="badge">
                  {skill.name}
                </span>
              ))}
            </div>
            <div className="text-center mt-4">
              <a href="/about/" className="btn btn-outline">
                Learn More About Me
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
