/**
 * Activity-feed helpers.
 *
 * The feed is a *union* of heterogeneous rows (portfolio created, project
 * analyzed, deployment shipped) pulled from three tables. We centralise the
 * shape here so the API route stays thin and the UI + tests have one source
 * of truth for the ActivityEvent contract.
 */

export type ActivityEventType =
  | "portfolio_created"
  | "project_analyzed"
  | "project_added"
  | "deployment_live"
  | "deployment_failed";

export interface ActivityEvent {
  id: string; // unique across types — prefix-composed below
  type: ActivityEventType;
  title: string;
  description: string | null;
  href: string | null; // where to click through
  portfolioId: string | null;
  projectId: string | null;
  occurredAt: string; // ISO timestamp
}

/**
 * Merge sorted-by-time lists of activity rows into a single descending feed.
 *
 * Each source table contributes raw rows with an `occurredAt` Date. We assume
 * the caller has already LIMITed each source; this just produces the merged
 * slice and re-applies a final limit.
 */
export function mergeActivity(
  events: ActivityEvent[],
  limit = 10
): ActivityEvent[] {
  return [...events]
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .slice(0, limit);
}

interface PortfolioRow {
  id: string;
  name: string;
  createdAt: Date | string | null;
}
interface ProjectRow {
  id: string;
  portfolioId: string;
  displayName: string | null;
  repoName: string | null;
  createdAt: Date | string | null;
  lastAnalyzed: Date | string | null;
  pipelineStatus: string | null;
}
interface DeploymentRow {
  id: string;
  portfolioId: string;
  status: string;
  url: string | null;
  createdAt: Date | string | null;
  deployedAt: Date | string | null;
}

/** Build portfolio-created events from raw rows. */
export function portfolioEvents(rows: PortfolioRow[]): ActivityEvent[] {
  return rows
    .filter((r) => r.createdAt != null)
    .map((r) => ({
      id: `pf_created:${r.id}`,
      type: "portfolio_created" as const,
      title: `Created portfolio "${r.name}"`,
      description: null,
      href: `/portfolios/${r.id}`,
      portfolioId: r.id,
      projectId: null,
      occurredAt: new Date(r.createdAt as Date | string).toISOString(),
    }));
}

/**
 * Build project events. A project contributes BOTH a "added" and, if analyzed,
 * an "analyzed" entry — users care about both milestones independently.
 */
export function projectEvents(rows: ProjectRow[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const r of rows) {
    const label = r.displayName ?? r.repoName ?? "project";
    if (r.createdAt) {
      out.push({
        id: `proj_added:${r.id}`,
        type: "project_added",
        title: `Added project ${label}`,
        description: null,
        href: `/portfolios/${r.portfolioId}?tab=projects`,
        portfolioId: r.portfolioId,
        projectId: r.id,
        occurredAt: new Date(r.createdAt).toISOString(),
      });
    }
    if (r.lastAnalyzed && r.pipelineStatus === "complete") {
      out.push({
        id: `proj_analyzed:${r.id}`,
        type: "project_analyzed",
        title: `Analyzed ${label}`,
        description: "Pipeline completed",
        href: `/portfolios/${r.portfolioId}/projects/${r.id}`,
        portfolioId: r.portfolioId,
        projectId: r.id,
        occurredAt: new Date(r.lastAnalyzed).toISOString(),
      });
    }
  }
  return out;
}

/** Build deployment events, labelled "live" or "failed" by status. */
export function deploymentEvents(rows: DeploymentRow[]): ActivityEvent[] {
  return rows.map((r) => {
    const failed = r.status === "failed" || r.status === "error";
    const when = r.deployedAt ?? r.createdAt;
    return {
      id: `deploy:${r.id}`,
      type: failed ? ("deployment_failed" as const) : ("deployment_live" as const),
      title: failed ? "Deployment failed" : "Deployed to production",
      description: r.url ?? null,
      href: `/portfolios/${r.portfolioId}?tab=deploy`,
      portfolioId: r.portfolioId,
      projectId: null,
      occurredAt: new Date(
        (when as Date | string) ?? new Date()
      ).toISOString(),
    };
  });
}

/** Humanise an ISO timestamp into "just now", "3m ago", etc. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const seconds = Math.round((now.getTime() - target.getTime()) / 1000);
  if (seconds < 0) return "just now"; // clock skew guard
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return target.toLocaleDateString();
}
