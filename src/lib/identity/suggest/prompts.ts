/**
 * Phase E7 — LLM prompts for the identity-pitch field suggester.
 *
 * Each prompt receives an already-distilled portfolio context (resume
 * highlights, top projects, outcomes) and returns a JSON array of
 * candidate strings. We keep the system prompts narrow and reject
 * generic resume-fluff phrases ("passionate developer", "dynamic team
 * player") so the suggestions feel hand-crafted rather than templated.
 */

import type { JsonSchemaSpec } from "@/lib/ai/providers/types";

/**
 * Compact view of the portfolio context the LLM prompts consume. We
 * pre-distil the heavyweight DB rows into this shape so the prompt
 * stays under ~1 KB and the LLM doesn't have to wade through raw JSON.
 */
export interface PortfolioContext {
  ownerName: string;
  /** Resume.basics.label if present (e.g. "Senior Backend Engineer"). */
  resumeLabel: string | null;
  /** Up to ~50 words of resume.basics.summary. */
  resumeSummary: string | null;
  /** Most recent N employers (up to 5). */
  recentEmployers: string[];
  /**
   * Up to 5 representative projects: name + 1-line description + a
   * comma-joined tech stack. Outcomes (metric + value) appended if
   * present.
   */
  topProjects: Array<{
    name: string;
    description: string | null;
    techStack: string[];
    outcomes: Array<{ metric: string; value: string }>;
  }>;
}

/**
 * Render the project list as a compact bullet block for prompt inclusion.
 */
function formatProjectsForPrompt(ctx: PortfolioContext): string {
  if (ctx.topProjects.length === 0) return "(no projects)";
  return ctx.topProjects
    .map((p, i) => {
      const tech =
        p.techStack.length > 0
          ? ` [${p.techStack.slice(0, 6).join(", ")}]`
          : "";
      const outcomes =
        p.outcomes.length > 0
          ? ` — ${p.outcomes
              .slice(0, 2)
              .map((o) => `${o.value} ${o.metric}`)
              .join(", ")}`
          : "";
      return `${i + 1}. ${p.name}${tech}: ${p.description ?? "no description"}${outcomes}`;
    })
    .join("\n");
}

/**
 * Build the system + user prompt pair for the positioning suggester.
 *
 * Positioning is the one-liner the hero leads with — it should be a
 * sharp, opinionated statement of WHAT the owner does and FOR WHOM.
 * Generic ("passionate developer", "team player") is failure.
 */
export function buildPositioningPrompt(
  ctx: PortfolioContext,
  count: number
): { system: string; user: string; schema: JsonSchemaSpec } {
  const system =
    "You write hero one-liners for engineer portfolios. Each one-liner is 60-140 characters, " +
    "specific to the engineer's actual work, never generic ('passionate developer', 'team player', " +
    "'detail-oriented'). Lead with what they BUILD or DO, not adjectives about themselves. " +
    "Vary the angle across candidates — e.g. one outcome-led ('shipped X to Y users'), one " +
    "discipline-led ('backend infra for high-throughput systems'), one positioning-led " +
    "('engineer who turns research papers into production code').";

  const projectsBlock = formatProjectsForPrompt(ctx);
  const employersBlock =
    ctx.recentEmployers.length > 0
      ? ctx.recentEmployers.slice(0, 5).join(", ")
      : "(none)";

  const user = [
    `Owner: ${ctx.ownerName}`,
    ctx.resumeLabel ? `Resume label: ${ctx.resumeLabel}` : "",
    ctx.resumeSummary ? `Resume summary: ${ctx.resumeSummary}` : "",
    `Recent employers: ${employersBlock}`,
    "Top projects:",
    projectsBlock,
    "",
    `Generate exactly ${count} positioning one-liners. Return JSON only.`,
  ]
    .filter(Boolean)
    .join("\n");

  const schema: JsonSchemaSpec = {
    name: "positioning_suggestions",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: count,
          maxItems: count,
          items: { type: "string", minLength: 20, maxLength: 160 },
        },
      },
    },
  };

  return { system, user, schema };
}

/**
 * Build prompt for CTA text suggestions. CTA is short — under 30 chars,
 * action-oriented, matches the hiring status (available/open/etc).
 */
export function buildCtaTextPrompt(
  ctx: PortfolioContext,
  hireStatus: "available" | "open" | "not-looking",
  count: number
): { system: string; user: string; schema: JsonSchemaSpec } {
  const system =
    "You write call-to-action button labels for engineer portfolios. Each label is 4-30 characters, " +
    "punchy, and matches the engineer's hiring status. Vary tone across candidates: one direct " +
    "('Hire me'), one collaborative ('Let's build something'), one role-specific ('Open to staff " +
    "backend roles'). Avoid clichés like 'Get in touch' unless nothing better fits.";

  const statusLine =
    hireStatus === "available"
      ? "Available for new work — tone should be direct, ready, confident."
      : hireStatus === "open"
        ? "Open to conversations — tone should be inviting, low-pressure."
        : "Not actively looking — should be quiet (e.g. 'Say hi'). Default to muted tone.";

  const user = [
    `Owner: ${ctx.ownerName}`,
    `Hiring status: ${hireStatus}. ${statusLine}`,
    ctx.resumeLabel ? `Role: ${ctx.resumeLabel}` : "",
    `Recent employers: ${ctx.recentEmployers.slice(0, 3).join(", ") || "(none)"}`,
    "",
    `Generate exactly ${count} CTA labels. Return JSON only.`,
  ]
    .filter(Boolean)
    .join("\n");

  const schema: JsonSchemaSpec = {
    name: "cta_text_suggestions",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: count,
          maxItems: count,
          items: { type: "string", minLength: 4, maxLength: 30 },
        },
      },
    },
  };

  return { system, user, schema };
}
