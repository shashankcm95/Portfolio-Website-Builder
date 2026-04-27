import React from "react";
import type { ProfileData } from "./types";

interface HeroSignalsProps {
  basics: ProfileData["basics"];
}

/**
 * Phase E8b — Tier-1 universal recruiter signals: current role + company,
 * availability date, role types, work eligibility, location.
 *
 * Each line is conditional: if the data isn't there, nothing is rendered
 * for it. When ALL fields are absent (older portfolios that predate the
 * Availability editor), the component returns null and templates render
 * exactly as they did pre-E8b.
 *
 * Class names use the `pwb-` prefix so per-template global.css can theme
 * the chip row to fit each design language. The default markup degrades
 * cleanly to a comma-separated list when unstyled.
 */
export function HeroSignals({ basics }: HeroSignalsProps) {
  const currentRole = formatCurrent(basics.currentRole, basics.currentCompany);
  const availability = formatAvailability(basics.availability);
  const roleTypes = formatRoleTypes(basics.roleTypes);
  const eligibility = formatEligibility(basics.workEligibility);
  const location = formatLocation(basics.location);

  // Bail early if there's nothing meaningful to render — keeps the DOM
  // identical to pre-E8b for portfolios that haven't filled these in.
  if (
    !currentRole &&
    !availability &&
    !roleTypes &&
    !eligibility &&
    !location
  ) {
    return null;
  }

  // Templates choose how to lay this out. Default markup is a stack of
  // small lines; per-template CSS can flatten them into a single chip
  // row, a sidebar list, or whatever fits.
  return (
    <div className="pwb-hero-signals" aria-label="Availability and preferences">
      {currentRole && (
        <p className="pwb-hero-signal pwb-hero-signal-current">
          <span className="pwb-hero-signal-label">Currently:</span>{" "}
          <span className="pwb-hero-signal-value">{currentRole}</span>
        </p>
      )}
      {availability && (
        <p className="pwb-hero-signal pwb-hero-signal-availability">
          <span className="pwb-hero-signal-value">{availability}</span>
        </p>
      )}
      {roleTypes && (
        <p className="pwb-hero-signal pwb-hero-signal-role-types">
          <span className="pwb-hero-signal-label">Open to:</span>{" "}
          <span className="pwb-hero-signal-value">{roleTypes}</span>
        </p>
      )}
      {(location || eligibility) && (
        <p className="pwb-hero-signal pwb-hero-signal-place">
          {location && (
            <span className="pwb-hero-signal-value">{location}</span>
          )}
          {location && eligibility && (
            <span className="pwb-hero-signal-sep"> · </span>
          )}
          {eligibility && (
            <>
              <span className="pwb-hero-signal-label">Authorized:</span>{" "}
              <span className="pwb-hero-signal-value">{eligibility}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatCurrent(
  role: string | undefined,
  company: string | undefined
): string | null {
  const r = role?.trim();
  const c = company?.trim();
  if (!r && !c) return null;
  if (r && c) return `${r} @ ${c}`;
  return r ?? c ?? null;
}

function formatAvailability(
  availability: ProfileData["basics"]["availability"]
): string | null {
  if (!availability) return null;
  switch (availability.kind) {
    case "available_now":
      return "Available now";
    case "available_after": {
      const date = availability.startDate?.trim();
      return date ? `Available ${date}` : "Available soon";
    }
    case "open_to_chat":
      return "Open to conversations";
    default:
      return null;
  }
}

function formatRoleTypes(
  roleTypes: ProfileData["basics"]["roleTypes"]
): string | null {
  if (!roleTypes) return null;
  // Group the flags into logical buckets so the rendered list stays
  // readable: who-you-are / how-you-work / where-you-work.
  const role: string[] = [];
  if (roleTypes.ic) role.push("IC");
  if (roleTypes.manager) role.push("Manager");

  const employment: string[] = [];
  if (roleTypes.fullTime) employment.push("Full-time");
  if (roleTypes.contract) employment.push("Contract");

  const place: string[] = [];
  if (roleTypes.remote) place.push("Remote");
  if (roleTypes.hybrid) place.push("Hybrid");
  if (roleTypes.onsite) place.push("Onsite");

  const segments: string[] = [];
  if (role.length > 0) segments.push(role.join(" / "));
  if (employment.length > 0) segments.push(employment.join(" / "));
  if (place.length > 0) segments.push(place.join(" / "));
  return segments.length > 0 ? segments.join(" · ") : null;
}

function formatEligibility(
  regions: string[] | undefined
): string | null {
  if (!regions || regions.length === 0) return null;
  return regions.join(" · ");
}

function formatLocation(
  loc: ProfileData["basics"]["location"]
): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.country].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );
  return parts.length > 0 ? parts.join(", ") : null;
}
