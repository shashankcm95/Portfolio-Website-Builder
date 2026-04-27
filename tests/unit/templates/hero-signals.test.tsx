/**
 * @jest-environment node
 *
 * Phase E8b — Tests for the shared HeroSignals component. Each
 * recruiter signal renders only when its data is populated, and the
 * component returns null entirely when nothing meaningful would
 * render — keeping pre-E8b portfolios visually unchanged.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfileData } from "../../../templates/_shared/types";
import { HeroSignals } from "../../../templates/_shared/hero-signals";

const minimalBasics: ProfileData["basics"] = {
  name: "Jane Doe",
  label: "Engineer",
  summary: "x",
  profiles: [],
};

describe("HeroSignals", () => {
  it("returns nothing when no signal fields are populated", () => {
    const html = renderToStaticMarkup(<HeroSignals basics={minimalBasics} />);
    expect(html).toBe("");
  });

  it("renders 'Currently: ROLE @ COMPANY' when both are set", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          currentRole: "Senior Backend Engineer",
          currentCompany: "Abbott",
        }}
      />
    );
    expect(html).toContain("Senior Backend Engineer @ Abbott");
    expect(html).toContain("pwb-hero-signal-current");
  });

  it("renders just the role when company is unset", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, currentRole: "Staff Engineer" }}
      />
    );
    expect(html).toContain("Staff Engineer");
    expect(html).not.toContain(" @ ");
  });

  it("renders 'Available now' for available_now availability", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, availability: { kind: "available_now" } }}
      />
    );
    expect(html).toContain("Available now");
    expect(html).toContain("pwb-hero-signal-availability");
  });

  it("renders 'Available <date>' for available_after with date", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          availability: { kind: "available_after", startDate: "May 2026" },
        }}
      />
    );
    expect(html).toContain("Available May 2026");
  });

  it("renders 'Available soon' when available_after lacks a date", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, availability: { kind: "available_after" } }}
      />
    );
    expect(html).toContain("Available soon");
  });

  it("renders 'Open to conversations' for open_to_chat", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, availability: { kind: "open_to_chat" } }}
      />
    );
    expect(html).toContain("Open to conversations");
  });

  it("groups role types into role / employment / place segments", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          roleTypes: {
            ic: true,
            manager: true,
            fullTime: true,
            remote: true,
            hybrid: true,
          },
        }}
      />
    );
    // Three segments separated by " · "
    expect(html).toContain("IC / Manager · Full-time · Remote / Hybrid");
  });

  it("omits segment when no flags in that group are set", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          roleTypes: { fullTime: true, remote: true },
        }}
      />
    );
    expect(html).toContain("Full-time · Remote");
    expect(html).not.toContain(" / "); // no slash within a single-flag segment
  });

  it("renders work eligibility chips", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, workEligibility: ["US", "Canada", "Remote-anywhere"] }}
      />
    );
    expect(html).toContain("US · Canada · Remote-anywhere");
  });

  it("renders city + region + country location", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          location: { city: "London", region: "England", country: "UK" },
        }}
      />
    );
    expect(html).toContain("London, England, UK");
  });

  it("combines location and eligibility into one line with separator", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{
          ...minimalBasics,
          location: { city: "London" },
          workEligibility: ["UK", "EU"],
        }}
      />
    );
    expect(html).toContain("London");
    expect(html).toContain("UK · EU");
    expect(html).toContain("pwb-hero-signal-sep");
  });

  it("ignores not_looking availability (no chip rendered)", () => {
    const html = renderToStaticMarkup(
      <HeroSignals
        basics={{ ...minimalBasics, availability: { kind: "not_looking" } }}
      />
    );
    expect(html).toBe("");
  });
});
