import React from "react";
import type { Testimonial } from "@/templates/_shared/types";

interface TestimonialPullQuoteProps {
  testimonial: Testimonial;
}

/**
 * Pull-quote testimonial interleaved between project cards.
 * Italic-serif quote text matches the kinetic personality; attribution
 * uses the same mono small-caps treatment as section eyebrows.
 */
export function TestimonialPullQuote({ testimonial }: TestimonialPullQuoteProps) {
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
    <figure className="pull-quote scroll-reveal">
      <blockquote className="pull-quote-text">“{quote}”</blockquote>
      <figcaption className="pull-quote-attr">
        <strong>{nameNode}</strong>
        {meta && <span>{meta}</span>}
      </figcaption>
    </figure>
  );
}
