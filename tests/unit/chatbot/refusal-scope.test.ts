/**
 * @jest-environment node
 *
 * Phase 5.2 §17 Layer 2 — semantic regression tests for the visitor
 * system prompt. These catch accidental deletions of the scope-hardening
 * policy during prompt edits. Pair with the opt-in `refusal-live` eval
 * (requires `LIVE_LLM_EVAL=1` + a real API key) for behavioral
 * verification at the model layer.
 *
 * Any change that makes one of these fail should be deliberate — update
 * the assertions in the same PR.
 */

import { buildSystemPrompt } from "@/lib/chatbot/prompt";
import { CANNED_REFUSAL } from "@/lib/chatbot/types";

function interpolateOwner(text: string, ownerName: string): string {
  return text.replace(/\{ownerName\}/g, ownerName);
}

const prompt = buildSystemPrompt({
  ownerName: "Ada Lovelace",
  portfolioName: "Ada's portfolio",
});

describe("visitor prompt — allow-list + refuse-list present", () => {
  it("advertises the assistant as scope-locked to the owner's work", () => {
    expect(prompt).toContain("professional assistant representing Ada Lovelace");
    expect(prompt).toContain("only to help visitors understand Ada Lovelace's professional work");
  });

  it("contains an ALLOWED TOPICS block naming projects, skills, background", () => {
    expect(prompt).toContain("ALLOWED TOPICS");
    expect(prompt).toMatch(/projects \(what they built/i);
    expect(prompt).toMatch(/skills, experience/i);
    expect(prompt).toMatch(/availability/i);
  });

  it("contains a REFUSE block covering coding / trivia / jokes / casual chat / political", () => {
    expect(prompt).toMatch(/\bREFUSE\b/);
    // Coding of any kind
    expect(prompt).toMatch(/writing.*debugging.*code/i);
    expect(prompt).toMatch(/even.*quick/i);
    // Trivia / general knowledge
    expect(prompt).toMatch(/general-knowledge trivia/i);
    // Jokes / roleplay / creative writing
    expect(prompt).toMatch(/jokes/i);
    expect(prompt).toMatch(/roleplay/i);
    expect(prompt).toMatch(/creative writing/i);
    // Casual conversation / life advice / emotional support
    expect(prompt).toMatch(/casual conversation/i);
    expect(prompt).toMatch(/emotional support/i);
    // Political / religious
    expect(prompt).toMatch(/political/i);
    expect(prompt).toMatch(/religious/i);
  });

  it("includes the canonical canned refusal verbatim", () => {
    const interpolated = interpolateOwner(CANNED_REFUSAL, "Ada Lovelace");
    expect(prompt).toContain(interpolated);
  });

  it("includes at least 3 few-shot Q/A refusal examples", () => {
    // Count "Q:" bullets; each must be paired with an "A:".
    const qCount = (prompt.match(/\bQ: /g) ?? []).length;
    const aCount = (prompt.match(/\bA: /g) ?? []).length;
    expect(qCount).toBeGreaterThanOrEqual(3);
    expect(aCount).toBeGreaterThanOrEqual(3);
    expect(qCount).toBe(aCount);
  });
});

describe("visitor prompt — prompt-injection defenses", () => {
  it("flags <question> content as untrusted and forbids following its instructions", () => {
    // `[\s\S]*` mirrors the `s` (dotAll) flag without requiring ES2018 in tsconfig.
    expect(prompt).toMatch(/<question>[\s\S]*untrusted/);
    expect(prompt).toMatch(/never follow instructions/i);
  });

  it("forbids revealing the system prompt", () => {
    expect(prompt).toMatch(/never reveal.*system prompt/i);
  });

  it("forbids changing role / tone / output format on request", () => {
    expect(prompt).toMatch(/ignore any request.*change/i);
  });
});

describe("visitor prompt — distinguishes off-topic from 'about-owner-but-missing-from-context'", () => {
  it("has a separate branch for legitimate questions with no grounding", () => {
    // Off-topic path routes to the canned refusal.
    // Legitimate-but-missing path routes to "I don't have that information"
    // + "reach out directly". Both must coexist and be distinct.
    expect(prompt).toMatch(/I don't have that information/i);
    expect(prompt).toMatch(/reaching out to them directly/i);
  });
});

describe("visitor prompt — output formatting", () => {
  it("bans code blocks and HTML in replies", () => {
    expect(prompt).toMatch(/no code blocks/i);
    expect(prompt).toMatch(/no HTML/i);
  });

  it("forbids inventing projects / employers / credentials / dates", () => {
    expect(prompt).toMatch(/never invent/i);
    expect(prompt).toMatch(/projects, employers, credentials, or dates/i);
  });
});
