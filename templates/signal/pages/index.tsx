import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";
import { TestimonialQuote } from "../components/TestimonialQuote";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Signal home — Hero, featured work list, testimonials woven between
 * project cards (one after the 2nd case by default). Skills section
 * deliberately omitted: research showed skill-logo grids are pure noise
 * for anyone senior. Tech stacks live inline on each project card.
 */
export function HomePage({ profileData }: HomePageProps) {
  const { projects, testimonials } = profileData;
  const featured = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const list = (featured.length > 0 ? featured : projects).slice(0, 6);

  // Interleave: show the first testimonial after the 2nd card so a visitor
  // sees one piece of named social proof above the fold on long lists.
  const interleavedIndex = list.length >= 2 ? 2 : list.length;
  const headTestimonial = testimonials?.[0];
  const tailTestimonials = testimonials?.slice(1) ?? [];

  return (
    <>
      <Hero basics={profileData.basics} />

      {list.length > 0 && (
        <section aria-label="Selected work">
          <div className="section-head">
            <span className="section-eyebrow">Selected work</span>
            <h2>Recent projects</h2>
          </div>

          <ol className="case-list">
            {list.map((p, i) => (
              <React.Fragment key={p.id}>
                <ProjectCard project={p} num={i + 1} />
                {i === interleavedIndex - 1 && headTestimonial && (
                  <TestimonialQuote testimonial={headTestimonial} />
                )}
              </React.Fragment>
            ))}
          </ol>

          {projects.length > list.length && (
            <p style={{ marginTop: "32px" }}>
              <a href="/projects/" className="hero-cta is-open">
                All work
              </a>
            </p>
          )}
        </section>
      )}

      {tailTestimonials.length > 0 && (
        <section aria-label="What people say">
          <div className="section-head">
            <span className="section-eyebrow">Reception</span>
            <h2>What people say</h2>
          </div>
          <div>
            {tailTestimonials.map((t, i) => (
              <TestimonialQuote key={`${t.authorName}-${i}`} testimonial={t} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
