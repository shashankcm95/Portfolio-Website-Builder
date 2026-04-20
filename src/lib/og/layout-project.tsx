/**
 * Phase 6 — Project-level OG image layout.
 *
 * Same Satori-subset constraints as the portfolio layout. Prominent
 * project name + 1-line description + tech-stack chips. The owner's
 * name stays small in the header so the project is the visual focus.
 */

import React from "react";
import { initials } from "./layout-portfolio";

export interface ProjectOgInput {
  ownerName: string;
  projectName: string;
  description?: string | null;
  techStack?: string[] | null;
}

const BG_GRADIENT =
  "linear-gradient(135deg, #042f2e 0%, #134e4a 40%, #0e7490 100%)";

export function ProjectOgLayout(input: ProjectOgInput): React.ReactElement {
  const ownerName = input.ownerName || "Developer";
  const projectName = input.projectName || "Project";
  const description = truncate(input.description ?? "", 220);
  const stack = (input.techStack ?? []).slice(0, 5);

  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        padding: "72px",
        background: BG_GRADIENT,
        color: "#f0fdfa",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Owner tagline (small) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "22px",
          color: "#5eead4",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "9999px",
            background: "rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            fontWeight: 700,
          }}
        >
          {initials(ownerName)}
        </div>
        <div style={{ display: "flex" }}>
          {ownerName}'s portfolio
        </div>
      </div>

      {/* Project name (hero) */}
      <div
        style={{
          marginTop: "36px",
          fontSize: "84px",
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
        }}
      >
        {projectName}
      </div>

      {/* Description */}
      {description && (
        <div
          style={{
            marginTop: "24px",
            fontSize: "30px",
            lineHeight: 1.35,
            color: "#ccfbf1",
            display: "flex",
          }}
        >
          {description}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Stack chips */}
      {stack.length > 0 && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {stack.map((tech, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "8px 16px",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.18)",
                fontSize: "20px",
                color: "#a7f3d0",
              }}
            >
              {tech}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
