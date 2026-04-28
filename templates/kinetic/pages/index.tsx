import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { Hero } from "../components/Hero";
import { ProjectCard } from "../components/ProjectCard";
import { TestimonialPullQuote } from "../components/TestimonialPullQuote";

interface HomePageProps {
  profileData: ProfileData;
}

/**
 * Kinetic home — hero (full-bleed, no .kinetic-main wrapper) followed
 * by a numbered project list with testimonials interleaved every 3rd
 * project. The first testimonial surfaces after the 2nd card so a
 * visitor sees one piece of named social proof before they finish
 * scanning the work.
 */
export function HomePage({ profileData }: HomePageProps) {
  const { projects, testimonials, basics } = profileData;
  const featured = projects
    .filter((p) => p.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const list = (featured.length > 0 ? featured : projects).slice(0, 6);

  // Interleave: first quote after the 2nd card, subsequent quotes every
  // 3rd thereafter. Bounded by the number of available testimonials.
  const quoteSlots: number[] = [];
  if (testimonials && testimonials.length > 0) {
    let nextSlot = 2;
    while (quoteSlots.length < testimonials.length && nextSlot <= list.length) {
      quoteSlots.push(nextSlot);
      nextSlot += 3;
    }
  }

  return (
    <>
      <Hero basics={basics} namedEmployers={basics.namedEmployers} />

      <main className="kinetic-main">
        {list.length > 0 && (
          <section id="work" aria-label="Selected work">
            <div className="section-head scroll-reveal">
              <span className="section-eyebrow">Selected work</span>
              <h2>
                Recent <em>projects</em>
              </h2>
            </div>

            <ol className="case-list">
              {list.map((p, i) => {
                const quoteIndex = quoteSlots.indexOf(i + 1);
                const quote =
                  quoteIndex >= 0 && testimonials?.[quoteIndex]
                    ? testimonials[quoteIndex]
                    : null;
                return (
                  <React.Fragment key={p.id}>
                    <ProjectCard project={p} num={i + 1} />
                    {quote && <TestimonialPullQuote testimonial={quote} />}
                  </React.Fragment>
                );
              })}
            </ol>

            {projects.length > list.length && (
              <p style={{ marginTop: "32px" }}>
                <a href="/projects/" className="kinetic-cta is-ghost">
                  All work
                  <span className="kinetic-cta-arrow" aria-hidden="true">↗</span>
                </a>
              </p>
            )}
          </section>
        )}

        {testimonials &&
          testimonials.length > quoteSlots.length &&
          quoteSlots.length < testimonials.length && (
            <section id="testimonials" aria-label="What people say">
              <div className="section-head scroll-reveal">
                <span className="section-eyebrow">Reception</span>
                <h2>
                  What people <em>say</em>
                </h2>
              </div>
              <div>
                {testimonials.slice(quoteSlots.length).map((t, i) => (
                  <TestimonialPullQuote
                    key={`${t.authorName}-${i}`}
                    testimonial={t}
                  />
                ))}
              </div>
            </section>
          )}
      </main>
    </>
  );
}
