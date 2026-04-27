/**
 * Phase E7 — Build the compact `PortfolioContext` the suggester
 * prompts consume. Reads from the same DB shape `profile-data.ts`
 * uses, but distils to ~1 KB so prompts stay short.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import type { PortfolioContext } from "./prompts";
import type { ProjectOutcome } from "@/templates/_shared/types";

/**
 * Load the portfolio + owner + visible projects, then distil into the
 * shape the suggestion prompts consume. Returns null when the
 * portfolio is missing — the API route turns that into a 404.
 */
export async function loadPortfolioContext(
  portfolioId: string
): Promise<{ ctx: PortfolioContext; userId: string } | null> {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, portfolioId),
    with: { user: true },
  });
  if (!portfolio) return null;

  const projectRows = await db.query.projects.findMany({
    where: eq(projects.portfolioId, portfolioId),
    orderBy: [projects.displayOrder],
  });

  // Up to 5 projects so the prompt budget stays small. Featured first,
  // then by displayOrder. The LLM doesn't benefit from seeing all 12.
  const sortedProjects = [...projectRows]
    .sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) {
        return a.isFeatured ? -1 : 1;
      }
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    })
    .slice(0, 5);

  const topProjects = sortedProjects.map((p) => {
    const meta = (p.repoMetadata ?? {}) as Record<string, unknown>;
    const description =
      (meta.description as string | undefined) ?? p.manualDescription ?? null;
    const techStack = Array.isArray(p.techStack)
      ? (p.techStack as string[])
      : [];
    const outcomes = Array.isArray(p.outcomes)
      ? (p.outcomes as ProjectOutcome[])
          .filter((o) => o && typeof o === "object" && o.metric && o.value)
          .map((o) => ({ metric: o.metric, value: o.value }))
      : [];
    return {
      name: p.displayName ?? p.repoName ?? "Untitled",
      description,
      techStack,
      outcomes,
    };
  });

  // Resume context — same shape `profile-data.ts` reads.
  const resumeJson = portfolio.user.resumeJson as
    | Record<string, unknown>
    | null;
  const basics =
    resumeJson && typeof resumeJson.basics === "object"
      ? (resumeJson.basics as Record<string, unknown>)
      : null;
  const resumeLabel =
    typeof basics?.label === "string" ? basics.label : null;
  const resumeSummary =
    typeof basics?.summary === "string"
      ? truncateSummary(basics.summary, 280)
      : null;

  // Recent employers from resume.work[]. Most recent first (resume
  // convention is newest-first; we don't reorder).
  const recentEmployers = extractEmployerNames(resumeJson);

  const ctx: PortfolioContext = {
    ownerName: portfolio.user.name ?? portfolio.user.githubUsername,
    resumeLabel,
    resumeSummary,
    recentEmployers,
    topProjects,
  };

  return { ctx, userId: portfolio.user.id };
}

/**
 * Mirror of `extractEmployerNames` in profile-data.ts — kept inline
 * here so the suggest module doesn't reach across module boundaries
 * just for a 6-line helper. Returns up to 5 unique employer names,
 * preserving resume order.
 */
function extractEmployerNames(
  resumeJson: Record<string, unknown> | null
): string[] {
  if (!resumeJson || !Array.isArray(resumeJson.work)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const w of resumeJson.work as Array<Record<string, unknown>>) {
    const raw =
      (typeof w.name === "string" && w.name) ||
      (typeof w.company === "string" && w.company);
    if (raw && typeof raw === "string") {
      const norm = raw.trim();
      if (norm && !seen.has(norm.toLowerCase())) {
        seen.add(norm.toLowerCase());
        names.push(norm);
        if (names.length >= 5) break;
      }
    }
  }
  return names;
}

/**
 * Trim a resume summary to a fixed character budget without cutting
 * mid-word. Falls back to a hard slice when no whitespace boundary
 * exists in the budget window.
 */
function truncateSummary(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > max - 60
    ? slice.slice(0, lastSpace).trimEnd() + "…"
    : slice.trimEnd() + "…";
}
