import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface ContactSectionProps {
  basics: ProfileData["basics"];
}

/**
 * Contact section with email link and social profile links.
 */
export function ContactSection({ basics }: ContactSectionProps) {
  return (
    <section className="contact-section">
      <div className="container container-narrow">
        <h2>Get in Touch</h2>
        <p className="mt-4">
          {"I'm always interested in hearing about new opportunities, "}
          {"collaborations, or just having a conversation about technology."}
        </p>

        <div className="contact-links">
          {basics.email && (
            <a href={`mailto:${basics.email}`} className="btn btn-primary">
              Send an Email
            </a>
          )}
          {basics.profiles.map((profile) => (
            <a
              key={profile.network}
              href={profile.url}
              className="btn btn-outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {profile.network}
            </a>
          ))}
        </div>

        {basics.email && (
          <p className="mt-8 text-sm text-muted">{basics.email}</p>
        )}
      </div>
    </section>
  );
}
