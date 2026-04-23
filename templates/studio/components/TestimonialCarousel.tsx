import React from "react";
import type { Testimonial } from "@/templates/_shared/types";

interface TestimonialCarouselProps {
  testimonials: Testimonial[];
}

/**
 * Horizontal scroll-snap carousel — no JS. Visitors swipe on mobile and
 * scroll horizontally on desktop. If more than 3 testimonials exist, the
 * ones past 3 still participate in the scroll; we don't paginate.
 *
 * Visible avatar is rendered only when provided (most testimonials won't
 * have one; we avoid a generic placeholder silhouette because it looks
 * worse than just the name).
 */
export function TestimonialCarousel({ testimonials }: TestimonialCarouselProps) {
  if (testimonials.length === 0) return null;

  return (
    <div className="carousel" role="region" aria-label="Testimonials">
      {testimonials.map((t, i) => {
        const meta = [t.authorTitle, t.authorCompany].filter(Boolean).join(" · ");
        const nameNode = t.authorUrl ? (
          <a href={t.authorUrl} target="_blank" rel="noopener noreferrer">
            {t.authorName}
          </a>
        ) : (
          t.authorName
        );
        return (
          <figure className="testimonial-card" key={`${t.authorName}-${i}`}>
            <blockquote className="testimonial-quote">“{t.quote}”</blockquote>
            <figcaption className="testimonial-author">
              {t.avatarUrl && (
                <img
                  className="testimonial-avatar"
                  src={t.avatarUrl}
                  alt=""
                  width={40}
                  height={40}
                />
              )}
              <div className="testimonial-meta">
                <strong>{nameNode}</strong>
                {meta && <span>{meta}</span>}
              </div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
