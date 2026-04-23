import React from "react";
import type { Testimonial } from "./types";

interface TestimonialsBlockProps {
  testimonials: Testimonial[];
  /**
   * Heading copy. Defaults to "What collaborators say" — templates with
   * a more formal voice (classic, editorial) or a more technical voice
   * (research, terminal) can override.
   */
  heading?: string;
  /**
   * Optional deck line under the heading. Renders as a muted paragraph.
   */
  deck?: string;
  /**
   * Class applied to the outer <section>. Templates use this to hook
   * into their existing section styling without needing to duplicate
   * our class names.
   */
  sectionClassName?: string;
}

/**
 * Phase R4 — Shared testimonial rendering used by the legacy templates
 * (minimal, classic, research, terminal, editorial). The class names
 * are stable across templates; each template's global.css styles
 * `.testimonials-section`, `.testimonial`, `.testimonial blockquote`,
 * and `.testimonial cite` to fit its own aesthetic.
 *
 * Signal and studio deliberately keep their bespoke components
 * (TestimonialQuote + TestimonialCarousel) — their visual treatment is
 * load-bearing to the template personality and wouldn't fit this
 * shared shape.
 */
export function TestimonialsBlock({
  testimonials,
  heading = "What collaborators say",
  deck,
  sectionClassName = "section testimonials-section",
}: TestimonialsBlockProps) {
  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section className={sectionClassName}>
      <div className="container">
        <div className="section-header">
          <h2>{heading}</h2>
          {deck && <p>{deck}</p>}
        </div>
        {testimonials.map((t, i) => {
          const meta = [t.authorTitle, t.authorCompany]
            .filter(Boolean)
            .join(" · ");
          return (
            <figure className="testimonial" key={`${t.authorName}-${i}`}>
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              <cite>
                <strong>
                  {t.authorUrl ? (
                    <a
                      href={t.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t.authorName}
                    </a>
                  ) : (
                    t.authorName
                  )}
                </strong>
                {meta && <> · {meta}</>}
              </cite>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
