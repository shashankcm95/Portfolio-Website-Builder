import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface ContactSectionProps {
  basics: ProfileData["basics"];
}

/**
 * Phase 7 — Terminal Contact. `mail --to` style listing.
 */
export function ContactSection({ basics }: ContactSectionProps) {
  return (
    <section className="section">
      <div className="container">
        <p className="prompt">cat contact.txt</p>
        <h2>contact</h2>
        <p>
          Drop me a line — happy to chat about reliability, infra,
          incident response, or anything system-shaped.
        </p>
        <ul className="facts-list" style={{ paddingLeft: 0, listStyle: "none" }}>
          {basics.email && (
            <li>
              <span style={{ color: "var(--text-comment)" }}>email:</span>{" "}
              <a href={`mailto:${basics.email}`}>{basics.email}</a>
            </li>
          )}
          {basics.profiles.map((p) => (
            <li key={p.network}>
              <span style={{ color: "var(--text-comment)" }}>
                {p.network.toLowerCase()}:
              </span>{" "}
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.url.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
