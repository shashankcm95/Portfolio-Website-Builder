/**
 * @jest-environment node
 *
 * Phase E8f — semantic regression tests for the visitor system prompt.
 *
 * The original prompt was refusal-by-default with three refusal-pattern
 * Q/A examples and zero positive ones. After deploying the live
 * chatbot was over-firing the refusal on legitimate questions like
 * "what is his background" and "tell me about his projects".
 *
 * The rewrite is permissive-by-default: the model is told to ANSWER
 * any question about the owner's work, with positive examples in the
 * prompt. Refusal is folded into one short out-of-scope clause.
 *
 * These tests now assert:
 *   - Permissive intent ("answer any question about ...")
 *   - Positive few-shot examples present
 *   - Greeting + meta-question handling clauses present
 *   - Out-of-scope redirect clause present (with the canonical
 *     CANNED_REFUSAL string)
 *   - Missing-info clause routes to "reach out directly"
 *   - All prompt-injection / format / no-invent rules unchanged
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

describe("visitor prompt — permissive intent + positive examples", () => {
  it("introduces the assistant as friendly and helpful, not scope-locked", () => {
    expect(prompt).toMatch(/friendly, helpful assistant/i);
    expect(prompt).toContain("Ada Lovelace");
    expect(prompt).toContain("Ada's portfolio");
  });

  it("instructs the model to ANSWER questions about every owner-related topic", () => {
    // The "ANSWER" clause has to be unambiguous and cover the topics
    // visitors actually ask about.
    expect(prompt).toMatch(/ANSWER any question/);
    expect(prompt).toMatch(/projects/i);
    expect(prompt).toMatch(/skills/i);
    expect(prompt).toMatch(/experience/i);
    expect(prompt).toMatch(/background/i);
    expect(prompt).toMatch(/employers/i);
    expect(prompt).toMatch(/availability/i);
  });

  it("includes positive few-shot Q/A examples (not just refusal patterns)", () => {
    // Pre-fix the prompt had 3 Q/A refusal examples and 0 positive
    // ones, biasing the small Llama model toward refusal. Each
    // positive example below names a real owner-question pattern.
    expect(prompt).toMatch(/Q: "What is his background\?"/);
    expect(prompt).toMatch(/Q: "Tell me about his projects"/);
    expect(prompt).toMatch(/Q: "Is he available for work\?"/);
  });

  it("explicitly handles greetings rather than refusing them", () => {
    expect(prompt).toMatch(/GREETINGS/);
    expect(prompt).toMatch(/hi \/ hello/i);
  });

  it("explicitly handles meta-questions about the assistant's scope", () => {
    expect(prompt).toMatch(/META-QUESTIONS/);
    expect(prompt).toMatch(/what you can help with/i);
  });
});

describe("visitor prompt — out-of-scope handling kept", () => {
  it("retains a redirect clause for the genuinely-off-topic asks", () => {
    expect(prompt).toMatch(/OUT-OF-SCOPE/);
    // The categories that *should* still be redirected.
    expect(prompt).toMatch(/code/i);
    expect(prompt).toMatch(/trivia/i);
    expect(prompt).toMatch(/jokes/i);
    expect(prompt).toMatch(/political/i);
  });

  it("includes the canonical canned refusal verbatim", () => {
    const interpolated = interpolateOwner(CANNED_REFUSAL, "Ada Lovelace");
    expect(prompt).toContain(interpolated);
  });
});

describe("visitor prompt — missing-info routing", () => {
  it("routes 'about-owner-but-not-in-context' to a contact-page redirect", () => {
    expect(prompt).toMatch(/MISSING INFO/);
    expect(prompt).toMatch(/I don't have that detail/i);
    expect(prompt).toMatch(/contact page/i);
  });
});

describe("visitor prompt — prompt-injection defenses", () => {
  it("flags <question> content as untrusted and forbids following its instructions", () => {
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
