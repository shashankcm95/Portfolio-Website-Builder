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
      ? "Let's build something"
      : "Start a conversation");

  return (
    <section className="section">
      <div className="container">
        <div className="section-header">
          <h2>Contact</h2>
          <p>
            {hiring?.status === "available"
              ? "Taking new engagements now. The easiest way to reach me is below."
              : hiring?.status === "open"
                ? "Open to conversations about interesting work."
                : `Reach out to ${basics.name.split(" ")[0]}.`}
          </p>
        </div>

        <div style={{ display: "grid", gap: "24px", maxWidth: "640px" }}>
          {primaryCta && (
            <a className="btn-primary" href={primaryCta}>
              {primaryLabel}
            </a>
          )}

          {email && (
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--color-muted)" }}>Email:</strong>{" "}
              <a href={`mailto:${email}`}>{email}</a>
            </p>
          )}

          {profiles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {profiles.map((p) => (
                <a
                  key={p.network}
                  className="btn-ghost"
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p.network} →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
