import React from "react";
import type { Testimonial } from "@/templates/_shared/types";

interface TestimonialQuoteProps {
  testimonial: Testimonial;
}

/**
 * Pull-quote block rendered between project cards on the home page.
 * Deliberately minimal — the quote and the attribution carry the weight;
 * the left-accent border + subtle surface fill do the visual work.
 *
 * Author is linked when `authorUrl` is set (usually LinkedIn or a personal
 * site). Title + company are surfaced inline with a bullet separator so
 * the attribution stays compact.
 */
export function TestimonialQuote({ testimonial }: TestimonialQuoteProps) {
  const { quote, authorName, authorTitle, authorCompany, authorUrl } =
    testimonial;

  const nameNode = authorUrl ? (
    <a href={authorUrl} target="_blank" rel="noopener noreferrer">
      {authorName}
    </a>
  ) : (
    authorName
  );

  const meta = [authorTitle, authorCompany].filter(Boolean).join(" · ");

  return (
    <figure className="quote-block">
      <blockquote className="quote-text">“{quote}”</blockquote>
      <figcaption className="quote-attr">
        <strong>{nameNode}</strong>
        {meta && <span>{meta}</span>}
      </figcaption>
    </figure>
  );
}
