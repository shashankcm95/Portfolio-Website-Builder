/**
 * @jest-environment node
 *
 * Phase E6 — `looksLikeSkillName` is the heuristic that keeps
 * sentence-shaped fact claims out of the skills chip row on every
 * published portfolio. Pre-E6 the fact-extractor was promoting claims
 * like "The architecture pattern is layered" to the Skills section,
 * which read as junk to recruiters. The mapping table no longer
 * routes `concept` / `pattern` / `architecture` categories into
 * skills, but the predicate is the belt-and-suspenders defense for
 * any future regression that lets a sentence slip through.
 */

import { looksLikeSkillName } from "@/lib/generator/profile-data";

describe("looksLikeSkillName", () => {
  it("accepts short noun-phrase skill names", () => {
    expect(looksLikeSkillName("TypeScript")).toBe(true);
    expect(looksLikeSkillName("React Native")).toBe(true);
    expect(looksLikeSkillName("AWS Lambda")).toBe(true);
    expect(looksLikeSkillName("PostgreSQL")).toBe(true);
    expect(looksLikeSkillName("Kubernetes")).toBe(true);
    expect(looksLikeSkillName("ci/cd")).toBe(true);
    expect(looksLikeSkillName("p2p-network")).toBe(true);
  });

  it("rejects sentences starting with a determiner", () => {
    expect(looksLikeSkillName("The architecture pattern is layered")).toBe(false);
    expect(looksLikeSkillName("The application is a mobile application")).toBe(false);
    expect(looksLikeSkillName("This project contains an APK file")).toBe(false);
    expect(looksLikeSkillName("A serverless deployment")).toBe(false);
    expect(looksLikeSkillName("An overview")).toBe(false);
  });

  it("rejects names ending with sentence-ending punctuation", () => {
    expect(looksLikeSkillName("typescript.")).toBe(false);
    expect(looksLikeSkillName("ready!")).toBe(false);
    expect(looksLikeSkillName("really?")).toBe(false);
  });

  it("rejects names containing sentence verbs", () => {
    expect(looksLikeSkillName("React is fast")).toBe(false);
    expect(looksLikeSkillName("Project has 4k stars")).toBe(false);
    expect(looksLikeSkillName("Library uses Rust")).toBe(false);
    expect(looksLikeSkillName("App contains models")).toBe(false);
    expect(looksLikeSkillName("Service follows pattern")).toBe(false);
  });

  it("rejects names longer than 32 chars", () => {
    expect(looksLikeSkillName("a-name-that-is-clearly-too-long-to-be-a-skill")).toBe(false);
  });

  it("does not false-positive on real skill names containing \"is\" as a substring", () => {
    // "Express" contains the substring "is" but is a single token
    // — the verb check tokenises on whitespace and shouldn't trip.
    expect(looksLikeSkillName("Express")).toBe(true);
    expect(looksLikeSkillName("Redis")).toBe(true);
    expect(looksLikeSkillName("istio")).toBe(true);
  });

  it("rejects empty / whitespace input", () => {
    expect(looksLikeSkillName("")).toBe(false);
    expect(looksLikeSkillName("   ")).toBe(false);
  });

  it("trims leading / trailing whitespace before checking length", () => {
    expect(looksLikeSkillName("  React  ")).toBe(true);
  });
});
