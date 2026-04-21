import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  listUserRepos,
  type UserRepoSummary,
} from "@/lib/github/repo-fetcher";
import { getAuthenticatedGitHubClient } from "@/lib/github/authenticated-client";

/**
 * Phase 10 Track A — list the signed-in user's public repos for the
 * bulk-import picker.
 *
 * GET /api/github/users/:login/repos?portfolioId=<uuid>
 *
 * Response: { repos: (UserRepoSummary & { alreadyImported: boolean })[] }
 *
 * When `portfolioId` is supplied, we scope the "already imported" flag to
 * that portfolio via a single IN query on (repoOwner + repoName) — a
 * recruiter clicking "Browse my repos" from the dashboard always has the
 * portfolio in context. When it's omitted, every row reports
 * `alreadyImported: false` so the picker is still usable standalone.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { login: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = params.login?.trim();
  if (!login) {
    return NextResponse.json(
      { error: "GitHub login is required" },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const portfolioId = url.searchParams.get("portfolioId");

  // If a portfolioId is supplied, verify ownership before we use it to
  // compute the alreadyImported flag. Silently fall through to the
  // no-scope path if ownership fails — no need to 403 on a GET that's
  // otherwise harmless.
  let importedKeys: Set<string> = new Set();
  let scopedPortfolioId: string | null = null;
  if (portfolioId) {
    const [portfolio] = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(
        and(
          eq(portfolios.id, portfolioId),
          eq(portfolios.userId, session.user.id)
        )
      )
      .limit(1);

    if (portfolio) {
      // Ownership confirmed — defer the actual intersection query until
      // after we have the GitHub repo list in hand, so we can IN-filter
      // by repo name rather than scanning the whole projects table.
      scopedPortfolioId = portfolioId;
    }
  }

  let repos: UserRepoSummary[];
  try {
    const client = await getAuthenticatedGitHubClient(session.user.id);
    repos = await listUserRepos(client, login, { perPage: 100 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // GitHub 403 with rate-limit message → surface as 429 to the client so
    // the UI can show "try again in X minutes" rather than a generic error.
    if (/\b403\b/.test(msg) && /rate.?limit/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "GitHub rate limit reached. Try again in a few minutes.",
          code: "github_rate_limited",
        },
        { status: 429 }
      );
    }
    if (/\b404\b/.test(msg)) {
      return NextResponse.json(
        { error: `GitHub user not found: ${login}` },
        { status: 404 }
      );
    }
    console.error("listUserRepos failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch repos from GitHub" },
      { status: 502 }
    );
  }

  // Compute alreadyImported in a single IN query when we have both a
  // scoped portfolio and a non-empty repo list.
  if (scopedPortfolioId && repos.length > 0) {
    const existing = await db
      .select({
        repoOwner: projects.repoOwner,
        repoName: projects.repoName,
      })
      .from(projects)
      .where(
        and(
          eq(projects.portfolioId, scopedPortfolioId),
          inArray(
            projects.repoName,
            repos.map((r) => r.name)
          )
        )
      );

    importedKeys = new Set(
      existing
        .filter((r) => r.repoOwner && r.repoName)
        .map(
          (r) => `${r.repoOwner!.toLowerCase()}/${r.repoName!.toLowerCase()}`
        )
    );
  }

  const enriched = repos.map((r) => ({
    ...r,
    alreadyImported: importedKeys.has(
      `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`
    ),
  }));

  return NextResponse.json({ repos: enriched });
}
