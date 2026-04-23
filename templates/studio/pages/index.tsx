import React from "react";
import type { ProfileData, Skill } from "@/templates/_shared/types";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";
import { TestimonialCarousel } from "../components/TestimonialCarousel";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Group top skills into services-ish buckets so the "What I do" card row
 * reads like offerings, not a logo wall. When categories don't produce
 * 2+ groups we skip the services section entirely.
 */
function groupSkills(skills: Skill[]): Array<{ title: string; items: string[] }> {
  const buckets = new Map<Skill["category"], string[]>();
  for (const s of skills) {
    const arr = buckets.get(s.category) ?? [];
    if (arr.length < 6) arr.push(s.name);
    buckets.set(s.category, arr);
  }
  const label: Record<Skill["category"], string> = {
    framework: "Frameworks",
    language: "Languages",
    tool: "Tools",
    concept: "Practices",
    other: "Also",
  };
  return Array.from(buckets.entries())
    .filter(([, items]) => items.length > 0)
    .map(([category, items]) => ({ title: label[category], items }));
}

export function HomePage({ profileData }: HomePageProps) {
  const { projects, testimonials, basics, skills } = profileData;
  const featured = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const list = (featured.length > 0 ? featured : projects).slice(0, 6);
  const services = groupSkills(skills);

  return (
    <>
      <Hero basics={basics} />

      {basics.namedEmployers && basics.namedEmployers.length > 0 && (
        <section className="clients" aria-label="Previously worked with">
          <div className="container">
            <p className="clients-label">Previously at</p>
            <ul className="clients-row">
              {basics.namedEmployers.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {list.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Selected work</h2>
              <p>A cross-section of recent projects and what they shipped.</p>
            </div>
            <ul className="project-grid">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {testimonials && testimonials.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>What collaborators say</h2>
              <p>Quotes from people I've worked with directly.</p>
            </div>
            <TestimonialCarousel testimonials={testimonials} />
          </div>
        </section>
      )}

      {services.length >= 2 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>What I work on</h2>
              <p>Grouped by where I spend the most time.</p>
            </div>
            <ul className="services-grid">
              {services.map((s) => (
                <li className="service-card" key={s.title}>
                  <h4>{s.title}</h4>
                  <p>{s.items.join(" · ")}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section>
        <div className="container">
          <div className="closing-cta">
            <h2>
              {basics.hiring?.status === "available"
                ? "Have a project in mind?"
                : "Let's stay in touch"}
            </h2>
            <p>
              {basics.hiring?.status === "available"
                ? `${basics.name} is currently taking new engagements. Share a few details and we'll find a time to talk.`
                : `Drop ${basics.name.split(" ")[0]} a line — even casual intros are welcome.`}
            </p>
            <a
              className="btn-primary"
              href={basics.hiring?.ctaHref || "/contact/"}
            >
              {basics.hiring?.ctaText || "Get in touch"}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
