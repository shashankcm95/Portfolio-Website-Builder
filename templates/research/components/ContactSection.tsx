import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface ContactSectionProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Research template Contact.
 *
 * Spartan: one-line opener, mailto + social inline. No CTA buttons,
 * no contact-form pretense. Matches the academic-page convention of
 * "send mail" being the primary contact mechanism.
 */
export function ContactSection({ basics }: ContactSectionProps) {
  return (
    <section className="contact-block">
      <div className="container">
        <h2>Contact</h2>
        <p>
          Open to collaborations, research discussions, and interesting
          problems.
        </p>
        <p className="contact-links">
          {basics.email && (
            <a href={`mailto:${basics.email}`}>{basics.email}</a>
          )}
          {basics.profiles.map((p) => (
            <a
              key={p.network}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {p.network}
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
