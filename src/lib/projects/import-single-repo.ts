import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, repoSources } from "@/lib/db/schema";
import { RepoFetcher } from "@/lib/github/repo-fetcher";
import { getAuthenticatedGitHubClient } from "@/lib/github/authenticated-client";
import { CredibilityFetcher } from "@/lib/github/credibility-fetcher";
import { extractVerifiedStack } from "@/lib/github/stack-detector";
import { logger } from "@/lib/log";

// ─── importSingleRepo (Phase 10 Track A) ────────────────────────────────────
//
// Originally lived inline in the projects POST route; extracted in Phase 10
// so the batch endpoint (`.../projects/import`) could reuse the exact same
// insert logic. Moved out of `route.ts` into this module so Next.js's
// generated route-types (which forbid non-handler exports from a route file)
// stop tripping `npm run typecheck`. Behavior-preserving — credibility fetch
// + Phase-8 category classification + verified-stack extraction +
// repoSources bulk-insert all match the previous version byte-for-byte.

export interface ImportSingleRepoOptions {
  /** The user issuing the import — used for the authenticated GitHub client. */
  userId: string;
  /** Owner's GitHub login — enables the Phase-8 category classifier. */
  userGithubLogin?: string | null;
  /**
   * Pre-computed displayOrder for the new row. When omitted, the helper
   * queries for the current max within the portfolio. The batch path
   * always passes an explicit order so it can assign sequential slots
   * per-repo without N round-trips.
   */
  displayOrder?: number;
}

export interface ImportSingleRepoResult {
  project: { id: string; repoName: string | null } & Record<string, unknown>;
  repoMetadata: { name: string; fullName: string };
}

export async function importSingleRepo(
  portfolioId: string,
  owner: string,
  repo: string,
  opts: ImportSingleRepoOptions
): Promise<ImportSingleRepoResult> {
  const client = await getAuthenticatedGitHubClient(opts.userId);
  const fetcher = new RepoFetcher(client);
  const repoData = await fetcher.fetchRepoData(owner, repo);

  // Phase 1: Credibility signals — never fatal. Phase 8: also classifies
  // the repo (personal_learning / personal_tool / oss_author /
  // oss_contributor / unspecified) so the coaching UI + portfolio byline
  // pick up the right category on first load.
  let credibilitySignals: unknown = null;
  let credibilityFetchedAt: Date | null = null;
  let initialCategory: string = "unspecified";
  try {
    const credFetcher = new CredibilityFetcher(client);
    const bundle = await credFetcher.fetchAll(
      owner,
      repo,
      repoData.metadata,
      repoData.dependencies,
      {
        userGithubLogin: opts.userGithubLogin ?? null,
      }
    );
    credibilitySignals = bundle;
    credibilityFetchedAt = new Date();
    initialCategory =
      bundle.authorshipSignal?.status === "ok"
        ? bundle.authorshipSignal.presentation?.category ?? "unspecified"
        : "unspecified";
  } catch (credError) {
    logger.warn("Credibility fetch failed (non-fatal)", { error: credError instanceof Error ? credError.message : String(credError) });
  }

  const verifiedStack = extractVerifiedStack(repoData.dependencies);

  let displayOrder = opts.displayOrder;
  if (displayOrder === undefined) {
    const existingProjects = await db
      .select({ displayOrder: projects.displayOrder })
      .from(projects)
      .where(eq(projects.portfolioId, portfolioId));
    const maxOrder = existingProjects.reduce(
      (max, p) => Math.max(max, p.displayOrder ?? 0),
      -1
    );
    displayOrder = maxOrder + 1;
  }

  const [project] = await db
    .insert(projects)
    .values({
      portfolioId,
      sourceType: "github",
      repoUrl: repoData.metadata.htmlUrl,
      repoOwner: owner,
      repoName: repo,
      displayName: repoData.metadata.name,
      displayOrder,
      repoMetadata: repoData.metadata,
      techStack: verifiedStack,
      credibilitySignals,
      credibilityFetchedAt,
      // Phase 8 — persist the classifier result so the coaching UI has
      // something to read without re-classifying on every page load.
      projectCategory: initialCategory,
      projectCategorySource: "auto",
      // Default the portfolio-characterization toggle on for flattering
      // categories; leave it off for `personal_learning` and
      // `oss_contributor` where the byline may read less favorably.
      showCharacterizationOnPortfolio:
        initialCategory === "personal_tool" ||
        initialCategory === "oss_author",
    })
    .returning();

  const sources: Array<{
    projectId: string;
    sourceType: string;
    content: string;
  }> = [];

  if (repoData.readme) {
    sources.push({
      projectId: project.id,
      sourceType: "readme",
      content: repoData.readme.substring(0, 50000),
    });
  }

  if (repoData.fileTree.length > 0) {
    sources.push({
      projectId: project.id,
      sourceType: "file_tree",
      content: JSON.stringify(repoData.fileTree.slice(0, 1000)),
    });
  }

  for (const dep of repoData.dependencies) {
    sources.push({
      projectId: project.id,
      sourceType: dep.type,
      content: dep.content.substring(0, 50000),
    });
  }

  if (sources.length > 0) {
    await db.insert(repoSources).values(sources);
  }

  return {
    project: project as ImportSingleRepoResult["project"],
    repoMetadata: {
      name: repoData.metadata.name,
      fullName: repoData.metadata.fullName,
    },
  };
}
