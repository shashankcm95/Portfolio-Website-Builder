/**
 * Phase E7 — Per-field suggestion engine.
 *
 * Mix of deterministic ranking (employers, anchor stat, ctaHref)
 * and LLM generation (positioning, ctaText). The deterministic
 * paths don't need an LLM key, so an owner without a configured
 * provider still gets useful defaults for the cheap fields and a
 * clear "configure your AI provider to suggest copy" error for the
 * LLM ones.
 */

import { hasLlmConfigForUser, getLlmClientForUser } from "@/lib/ai/providers/factory";
import { LlmInvalidKeyError } from "@/lib/ai/providers/types";
import { logger } from "@/lib/log";
import { loadPortfolioContext } from "./context";
import type { PortfolioContext } from "./prompts";
import {
  buildPositioningPrompt,
  buildCtaTextPrompt,
} from "./prompts";
import type { AnchorStatSuggestion, SuggestField, SuggestResponse } from "./types";

const DEFAULT_COUNT = 3;

interface SuggestArgs {
  portfolioId: string;
  field: SuggestField;
  /** Optional integer that varies the LLM seed across regenerate clicks. */
  seed?: number;
  /** How many candidates to return. Default 3. */
  count?: number;
}

export type SuggestResult =
  | { ok: true; response: SuggestResponse }
  | { ok: false; status: number; error: string; code: string };

/**
 * Top-level dispatcher. The route handler calls this once per request.
 */
export async function suggestField(args: SuggestArgs): Promise<SuggestResult> {
  const loaded = await loadPortfolioContext(args.portfolioId);
  if (!loaded) {
    return { ok: false, status: 404, error: "Portfolio not found", code: "not_found" };
  }
  const { ctx, userId } = loaded;
  const count = clampCount(args.count);

  switch (args.field) {
    case "namedEmployers":
      return {
        ok: true,
        response: { field: "namedEmployers", suggestions: suggestNamedEmployers(ctx, count) },
      };
    case "ctaHref":
      return {
        ok: true,
        response: { field: "ctaHref", suggestions: suggestCtaHref(ctx) },
      };
    case "anchorStat":
      return {
        ok: true,
        response: { field: "anchorStat", suggestions: suggestAnchorStat(ctx, count) },
      };
    case "positioning":
      return suggestPositioning(userId, ctx, count, args.seed);
    case "ctaText":
      // CTA text needs to know hire status; we infer "available" as the
      // most common case here. The route can pass it explicitly later
      // if we want true status-awareness — for now this is "the AI
      // suggester assumes you'd say yes to work".
      return suggestCtaText(userId, ctx, "available", count, args.seed);
  }
}

function clampCount(c: number | undefined): number {
  if (typeof c !== "number" || !Number.isFinite(c)) return DEFAULT_COUNT;
  return Math.min(5, Math.max(1, Math.floor(c)));
}

// ─── Deterministic field suggesters ─────────────────────────────────────────

/**
 * Recent employers in resume order, deduplicated, capped at `count`.
 * The user's screen is a tag input, so each suggestion is a single
 * employer name they can add with one click.
 */
function suggestNamedEmployers(ctx: PortfolioContext, count: number): string[] {
  return ctx.recentEmployers.slice(0, count);
}

/**
 * Three sensible CTA href candidates — no LLM needed, the choice is
 * structural. Most owners want one of these three:
 *   1. The in-site Contact page (default — keeps visitors on-site)
 *   2. mailto: with their resume email (when they want a direct line)
 *   3. A Calendly placeholder ("https://calendly.com/your-handle")
 *      — the LLM can't generate a real Calendly URL, so we surface a
 *      placeholder the owner can edit.
 */
function suggestCtaHref(ctx: PortfolioContext): string[] {
  const out: string[] = ["/contact/"];
  // Resume email isn't surfaced via PortfolioContext; we rely on the
  // owner having one in their resume to derive a mailto. As a fallback
  // we suggest a generic mailto template they can fill in.
  const slug = ctx.ownerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  out.push(`https://calendly.com/${slug || "your-handle"}/30min`);
  out.push(`mailto:${slug || "you"}@example.com`);
  return out;
}

/**
 * Rank the same candidates `deriveAnchorStat` ranks in profile-data,
 * but return the top N rather than just the winner. The user picks
 * which one represents them best. Falls back to a synthetic
 * "Previously at" candidate when the user has nothing to anchor on.
 */
function suggestAnchorStat(
  ctx: PortfolioContext,
  count: number
): AnchorStatSuggestion[] {
  type Cand = AnchorStatSuggestion & { score: number };
  const cands: Cand[] = [];

  for (const p of ctx.topProjects) {
    for (const o of p.outcomes) {
      cands.push({
        value: o.value,
        unit: o.metric,
        context: `on ${p.name}`,
        rationale: `Project outcome from ${p.name}`,
        score: 1000 + parseMagnitude(o.value),
      });
    }
  }

  if (ctx.recentEmployers.length > 0) {
    const top = ctx.recentEmployers.slice(0, 3).join(", ");
    cands.push({
      value: "Previously at",
      unit: top,
      rationale: "Built from resume work history",
      score: 200 + Math.min(50, ctx.recentEmployers.length * 10),
    });
  }

  cands.sort((a, b) => b.score - a.score);
  // Strip the score before returning — it's an internal ranking detail.
  return cands.slice(0, count).map(({ score: _score, ...rest }) => rest);
}

/**
 * Same magnitude parser as `parseMagnitude` in profile-data.ts. Kept
 * inline so the suggest module doesn't depend on the renderer's
 * internal helpers.
 */
function parseMagnitude(raw: string): number {
  const match = raw.match(/([\d.]+)\s*([kKmMbB]?)/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n)) return 0;
  const suffix = match[2]?.toLowerCase();
  switch (suffix) {
    case "b":
      return n * 1e9;
    case "m":
      return n * 1e6;
    case "k":
      return n * 1e3;
    default:
      return n;
  }
}

// ─── LLM field suggesters ───────────────────────────────────────────────────

async function suggestPositioning(
  userId: string,
  ctx: PortfolioContext,
  count: number,
  seed?: number
): Promise<SuggestResult> {
  if (!(await hasLlmConfigForUser(userId))) {
    return llmConfigError("positioning");
  }
  const llm = await getLlmClientForUser(userId);
  const { system, user, schema } = buildPositioningPrompt(ctx, count);
  try {
    const result = await llm.structured<{ suggestions: string[] }>({
      systemPrompt: system,
      userPrompt: user,
      jsonSchema: schema,
      // Higher temperature varies output across regenerate clicks.
      // Adding the seed nudges the output slightly between calls
      // without abandoning the schema constraint.
      temperature: 0.75 + ((seed ?? 0) % 10) * 0.01,
      maxTokens: 600,
    });
    return {
      ok: true,
      response: {
        field: "positioning",
        suggestions: dedupeStrings(result.suggestions ?? []).slice(0, count),
      },
    };
  } catch (err) {
    return llmCallError(err, "positioning");
  }
}

async function suggestCtaText(
  userId: string,
  ctx: PortfolioContext,
  hireStatus: "available" | "open" | "not-looking",
  count: number,
  seed?: number
): Promise<SuggestResult> {
  if (!(await hasLlmConfigForUser(userId))) {
    return llmConfigError("ctaText");
  }
  const llm = await getLlmClientForUser(userId);
  const { system, user, schema } = buildCtaTextPrompt(ctx, hireStatus, count);
  try {
    const result = await llm.structured<{ suggestions: string[] }>({
      systemPrompt: system,
      userPrompt: user,
      jsonSchema: schema,
      temperature: 0.85 + ((seed ?? 0) % 10) * 0.01,
      maxTokens: 200,
    });
    return {
      ok: true,
      response: {
        field: "ctaText",
        suggestions: dedupeStrings(result.suggestions ?? []).slice(0, count),
      },
    };
  } catch (err) {
    return llmCallError(err, "ctaText");
  }
}

function dedupeStrings(strs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of strs) {
    const trimmed = typeof s === "string" ? s.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function llmConfigError(field: string): SuggestResult {
  return {
    ok: false,
    status: 400,
    error:
      "Configure an AI provider key in your account settings to use AI suggestions",
    code: "no_llm_config",
  };
}

function llmCallError(err: unknown, field: string): SuggestResult {
  if (err instanceof LlmInvalidKeyError) {
    return {
      ok: false,
      status: 401,
      error:
        "Your AI provider API key is invalid. Update it in account settings to use AI suggestions.",
      code: "invalid_llm_key",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  logger.error("[suggest] LLM call failed", { field, error: msg });
  return {
    ok: false,
    status: 502,
    error: `Failed to generate suggestions: ${msg.slice(0, 200)}`,
    code: "llm_error",
  };
}
