/**
 * Phase 7 — Layout review agent shared types.
 *
 * Three tiers of checks contribute issues:
 *   - "static"   parses the generated HTML with cheerio (cheap, no
 *                browser needed, runs everywhere)
 *   - "rendered" headless Chromium via Playwright at multiple
 *                viewports (catches things only a real layout knows
 *                about — name wrapping, contrast, overflow)
 *   - "ai"       optional Claude Vision narrative review of a
 *                screenshot (subjective polish, opt-in)
 *
 * Each issue carries a stable `rule` identifier so the UI can map to
 * a help link / fix-it card later, plus enough context (page, viewport,
 * selector) to point the user at the offending spot.
 */

export type IssueSeverity = "critical" | "warning" | "info";
export type IssueTier = "static" | "rendered" | "ai";

export interface LayoutIssue {
  /** Stable id like "R10-hero-name-wraps". */
  rule: string;
  tier: IssueTier;
  severity: IssueSeverity;
  message: string;
  /** Page key — "index" | "about" | "projects" | "projects/<slug>" | "contact". */
  page?: string;
  /** Pixels — only present for tier "rendered". */
  viewport?: number;
  /** CSS selector for the offending element, when knowable. */
  elementSelector?: string;
  /** Free-form metric blob (actual chars, ratio measured, etc.). */
  details?: Record<string, unknown>;
}

export interface LayoutReviewSummary {
  id: string;
  portfolioId: string;
  templateId: string;
  status: "running" | "completed" | "failed";
  /** 0-100 composite. Null while running. */
  score: number | null;
  issues: LayoutIssue[];
  /** True when Playwright was runnable in this environment. */
  tier2Available: boolean;
  /** True when Tier 3 vision review was requested + completed. */
  tier3Available: boolean;
  /** Tier 3 narrative — null when Tier 3 didn't run. */
  aiSummary: string | null;
  /** ISO timestamps; UI shows relative time. */
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

/** Viewports Tier 2 renders at, in pixels. */
export const REVIEW_VIEWPORTS = [375, 768, 1280] as const;
export type ReviewViewport = (typeof REVIEW_VIEWPORTS)[number];

/** Page keys the runner inspects. Mirrors the generator's output map. */
export const REVIEWED_PAGES = [
  "index",
  "about",
  "projects",
  "contact",
] as const;
export type ReviewedPage = (typeof REVIEWED_PAGES)[number];
