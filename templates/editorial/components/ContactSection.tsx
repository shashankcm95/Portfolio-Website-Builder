import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface ContactSectionProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Editorial Contact. Cream-tinted block, big display
 * heading, contact list as a hairline-separated table.
 */
export function ContactSection({ basics }: ContactSectionProps) {
  return (
    <section className="contact-block">
      <div className="container-narrow">
        <p className="section-eyebrow">Get in touch</p>
        <h2>Open for collaboration.</h2>
        <ul className="contact-list">
          {basics.email && (
            <li>
              <span className="label">Email</span>
              <a href={`mailto:${basics.email}`}>{basics.email}</a>
            </li>
          )}
          {basics.profiles.map((p) => (
            <li key={p.network}>
              <span className="label">{p.network}</span>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.url.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
