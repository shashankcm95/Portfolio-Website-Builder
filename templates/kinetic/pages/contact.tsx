import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface ContactPageProps {
  profileData: ProfileData;
}

export function ContactPage({ profileData }: ContactPageProps) {
  const { basics } = profileData;
  const { hiring, email, profiles } = basics;
  const primaryCta = hiring?.ctaHref || (email ? `mailto:${email}` : undefined);
  const primaryLabel =
    hiring?.ctaText ||
    (hiring?.status === "available"
      ? "Let's talk about work"
      : "Say hi");

  return (
    <section aria-label="Contact">
      <div
        className="section-head animate-blur-fade-up"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        <span className="section-eyebrow">Contact</span>
        <h2>
          Reach <em>out</em>
        </h2>
      </div>

      <div
        className="contact-block animate-blur-fade-up"
        style={{ "--d": "180ms" } as React.CSSProperties}
      >
        {hiring && hiring.status !== "not-looking" && (
          <p style={{ margin: 0, color: "var(--color-muted)" }}>
            {hiring.status === "available"
              ? "Currently available for new work."
              : "Open to conversations about new work."}
          </p>
        )}

        <div className="prose" style={{ margin: 0 }}>
          <p style={{ margin: 0 }}>
            {basics.positioning ||
              basics.summary ||
              `Get in touch with ${basics.name}.`}
          </p>
        </div>

        {primaryCta && (
          <p style={{ margin: 0 }}>
            <a className="kinetic-cta" href={primaryCta}>
              {primaryLabel}
              <span className="kinetic-cta-arrow" aria-hidden="true">↗</span>
            </a>
          </p>
        )}

        {email && !hiring?.ctaHref && (
          <p style={{ margin: 0 }}>
            <a className="contact-link" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        )}

        {profiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {profiles.map((p) => (
              <a
                key={p.network}
                className="contact-link"
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.network} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
