/**
 * Phase 6 — Portfolio-level OG image layout.
 *
 * Rendered via `@vercel/og`'s Satori runtime (subset of React JSX — no
 * hooks, no `className`, only inline `style`). 1200×630 canvas, designed
 * to look good as a Twitter/LinkedIn/Slack unfurl thumbnail.
 *
 * Input shape is intentionally minimal so this is cheap to compose from
 * a DB row without touching the full `ProfileData` contract.
 */

import React from "react";

export interface PortfolioOgInput {
  name: string;
  /** One-line role, e.g. "Staff Software Engineer — ML infra". */
  label?: string | null;
  /** 1-2 sentence summary; trimmed to ~260 chars. */
  summary?: string | null;
  /** Absolute URL to the owner's avatar. Optional — layout adapts. */
  avatarUrl?: string | null;
  /** Top 3 skills, already truncated. */
  topSkills?: string[] | null;
}

const BG_GRADIENT =
  "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #312e81 100%)";

export function PortfolioOgLayout(input: PortfolioOgInput): React.ReactElement {
  const name = input.name || "Portfolio";
  const label = input.label?.trim() || "Software Developer";
  const summary = truncate(input.summary ?? "", 260);
  const avatarUrl = input.avatarUrl || null;
  const skills = (input.topSkills ?? []).slice(0, 3);

  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        padding: "72px",
        background: BG_GRADIENT,
        color: "#f8fafc",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            width={112}
            height={112}
            style={{
              borderRadius: "9999px",
              border: "3px solid rgba(255,255,255,0.2)",
            }}
          />
        ) : (
          <div
            style={{
              width: "112px",
              height: "112px",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              fontWeight: 700,
              color: "#c7d2fe",
            }}
          >
            {initials(name)}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "52px", fontWeight: 700, lineHeight: 1.1 }}>
            {name}
          </div>
          <div style={{ fontSize: "28px", color: "#c7d2fe", lineHeight: 1.2 }}>
            {label}
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div
          style={{
            marginTop: "56px",
            fontSize: "30px",
            lineHeight: 1.4,
            color: "#e2e8f0",
            display: "flex",
          }}
        >
          {summary}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer: skill chips */}
      {skills.length > 0 && (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {skills.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: "22px",
                color: "#e0e7ff",
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/** Derive up to 2 initial characters from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}
