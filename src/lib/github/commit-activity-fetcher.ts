import type { GitHubClient } from "@/lib/github/client";
import type { CommitActivitySignal } from "@/lib/credibility/types";

/**
 * Response shape for GET /repos/{owner}/{repo}/stats/commit_activity.
 * Each bucket represents one week; `days` is a 7-element array indexed
 * Sunday→Saturday of commit counts that day.
 */
interface CommitActivityWeek {
  week: number;
  total: number;
  days: number[];
}

const STATS_COMPUTING = 202;
const NO_CONTENT = 204;
const TOTAL_WEEKS = 52;

/**
 * Fetch the trailing 52 weeks of commit activity and compute
 * `activeDayCount` = distinct calendar days with ≥1 commit.
 *
 * Handles GitHub's quirky stats endpoints: 202 means "stats are being
 * computed, come back soon"; 204 means "empty repo". Both map to
 * `status: "missing"` — the factor scorer treats missing as "no positive
 * signal" rather than an outright error.
 */
export async function fetchCommitActivity(
  client: GitHubClient,
  owner: string,
  repo: string
): Promise<CommitActivitySignal> {
  try {
    const { data, headers } = await client.getWithHeaders<
      CommitActivityWeek[] | null
    >(`/repos/${owner}/${repo}/stats/commit_activity`);

    // Explicit 202/204 check via status header isn't exposed by fetch in
    // the same shape; we infer by body shape: empty body / empty array.
    // The client throws on !response.ok, so a 204 No Content lands here
    // as either empty string parsed → null, or an empty array.
    if (!Array.isArray(data) || data.length === 0) {
      return { status: "missing" };
    }

    return {
      status: "ok",
      activeDayCount: countActiveDays(data),
      totalWeeks: TOTAL_WEEKS,
    };
    void headers; // not used; reserved for future debugging
  } catch (e) {
    // GitHub stats endpoints can return 202 briefly while computing.
    // Our client throws on non-2xx; surface 202 specifically as missing.
    if (e instanceof Error && /\b(202|204)\b/.test(e.message)) {
      return { status: "missing" };
    }
    return { status: "error" };
  }
}

/**
 * Count distinct (week × day) slots where the commit count is ≥1.
 * Each slot is a unique calendar day, so this gives the active-day count
 * without needing date arithmetic.
 */
export function countActiveDays(weeks: CommitActivityWeek[]): number {
  let active = 0;
  for (const week of weeks) {
    if (!Array.isArray(week.days)) continue;
    for (const count of week.days) {
      if (count > 0) active++;
    }
  }
  return active;
}
