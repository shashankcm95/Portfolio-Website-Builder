import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface SignalRailProps {
  basics: ProfileData["basics"];
  currentPage: string;
}

/**
 * Pinned rail content. On desktop it's sticky with full height; on
 * mobile the parent <aside> reflows to a stacked header via CSS grid
 * (no JS media-query switching).
 *
 * Content hierarchy — top to bottom:
 *   1. Name (display font, large, tight tracking)
 *   2. Positioning one-liner (fallback to label when unset)
 *   3. Nav links (active state driven by `currentPage`)
 *   4. Social profiles (only those extracted from resume / GH)
 *
 * No avatar on the rail — intentional. The research showed faces are
 * optional and often clutter; the strongest portfolios lead with the
 * sharpest sentence, not a headshot.
 */
export function SignalRail({ basics, currentPage }: SignalRailProps) {
  const navItems = [
    { href: "/", label: "Home", id: "home" },
    { href: "/projects/", label: "Work", id: "projects" },
    { href: "/about/", label: "About", id: "about" },
    { href: "/contact/", label: "Contact", id: "contact" },
  ];

  return (
    <>
      <div>
        <h1 className="rail-brand">
          <a href="/">{basics.name}</a>
        </h1>
        <p className="rail-positioning">
          {basics.positioning || basics.label}
        </p>

        <nav className="rail-nav" aria-label="Primary">
          <ul>
            {navItems.map((n) => (
              <li key={n.id}>
                <a
                  href={n.href}
                  className={currentPage === n.id ? "active" : undefined}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {basics.profiles.length > 0 && (
        <div className="rail-socials" aria-label="Social profiles">
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
        </div>
      )}
    </>
  );
}
