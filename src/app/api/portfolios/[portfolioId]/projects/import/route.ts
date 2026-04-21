import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { pLimit } from "@/lib/github/concurrency";
import { importSingleRepo } from "@/app/api/portfolios/[portfolioId]/projects/route";

/**
 * Phase 10 Track A — bulk repo import.
 *
 * POST body: { repos: [{ owner, name }, ...] }  (up to 10)
 * Response:  { results: [{ owner, name, status, projectId?, reason? }, ...] }
 *
 * Partial failure is expected-and-fine: we return 200 with a per-row status
 * ("imported" | "skipped" | "failed"). The batch never aborts because one
 * repo errors. The parent UI renders outcome badges per row.
 *
 * Concurrency: we fan out at 3 parallel GitHub fetches. That's below
 * GitHub's abuse-detection threshold for same-user reads and leaves
 * headroom for the per-repo credibility fan-out inside `importSingleRepo`.
 */

const MAX_REPOS_PER_BATCH = 10;
const IMPORT_CONCURRENCY = 3;

interface ImportRepoInput {
  owner: string;
  name: string;
}

interface ImportResultRow {
  owner: string;
  name: string;
  status: "imported" | "skipped" | "failed";
  projectId?: string;
  reason?: string;
}

function isValidRepo(x: unknown): x is ImportRepoInput {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.owner === "string" &&
    typeof r.name === "string" &&
    r.owner.trim().length > 0 &&
    r.name.trim().length > 0
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check.
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.id, params.portfolioId),
        eq(portfolios.userId, session.user.id)
      )
    )
    .limit(1);

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const rawRepos = (body as { repos?: unknown })?.repos;
  if (!Array.isArray(rawRepos) || rawRepos.length === 0) {
    return NextResponse.json(
      { error: "At least one repo is required" },
      { status: 400 }
    );
  }

  if (rawRepos.length > MAX_REPOS_PER_BATCH) {
    return NextResponse.json(
      {
        error: `Too many repos — max ${MAX_REPOS_PER_BATCH} per batch`,
      },
      { status: 400 }
    );
  }

  // Validate & dedupe by "owner/name" (case-insensitive to match GitHub).
  const seen = new Set<string>();
  const repos: ImportRepoInput[] = [];
  for (const r of rawRepos) {
    if (!isValidRepo(r)) continue;
    const key = `${r.owner.toLowerCase()}/${r.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({ owner: r.owner, name: r.name });
  }

  if (repos.length === 0) {
    return NextResponse.json(
      { error: "No valid repos in request" },
      { status: 400 }
    );
  }

  // Pre-flight: confirm an LLM provider is configured before we do any
  // GitHub work. The analyze pipeline we fire per project needs it, and a
  // 409 here is much cheaper than 10 async pipeline failures.
  const { hasLlmConfigForUser } = await import("@/lib/ai/providers/factory");
  const configured = await hasLlmConfigForUser(session.user.id);
  if (!configured) {
    return NextResponse.json(
      {
        error:
          "No LLM provider is configured. Set one up in Settings → AI Provider.",
        code: "llm_not_configured",
      },
      { status: 409 }
    );
  }

  // Pre-flight dedupe against existing imports in this portfolio. One query
  // scoping by (owner, name) pairs — cheaper than N scalar lookups.
  const existingRows = await db
    .select({
      repoOwner: projects.repoOwner,
      repoName: projects.repoName,
    })
    .from(projects)
    .where(
      and(
        eq(projects.portfolioId, params.portfolioId),
        inArray(
          projects.repoName,
          repos.map((r) => r.name)
        )
      )
    );

  const importedKeys = new Set(
    existingRows
      .filter((r) => r.repoOwner && r.repoName)
      .map((r) => `${r.repoOwner!.toLowerCase()}/${r.repoName!.toLowerCase()}`)
  );

  // Compute starting displayOrder. We assign sequentially inside the loop
  // so order matches the user's pick order.
  const orderRows = await db
    .select({ displayOrder: projects.displayOrder })
    .from(projects)
    .where(eq(projects.portfolioId, params.portfolioId));
  const startOrder =
    orderRows.reduce((max, p) => Math.max(max, p.displayOrder ?? 0), -1) + 1;

  const limit = pLimit(IMPORT_CONCURRENCY);
  const results: ImportResultRow[] = [];

  // Atomically reserve displayOrder slots per-repo. Skipped rows don't
  // consume a slot.
  let nextOrderOffset = 0;
  const orderGuard = (): number => nextOrderOffset++;

  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
        if (importedKeys.has(key)) {
          results.push({
            owner: repo.owner,
            name: repo.name,
            status: "skipped",
            reason: "already imported",
          });
          return;
        }

        try {
          const { project } = await importSingleRepo(
            params.portfolioId,
            repo.owner,
            repo.name,
            {
              userId: session.user!.id!,
              displayOrder: startOrder + orderGuard(),
            }
          );

          // Fire-and-forget pipeline kickoff. Failure here shouldn't block
          // the batch response — the project row exists and the user can
          // hit "Analyze" manually from the dashboard.
          try {
            const { startPipeline } = await import(
              "@/lib/pipeline/orchestrator"
            );
            startPipeline(project.id);
          } catch (pipelineErr) {
            console.warn(
              `startPipeline failed for ${project.id}:`,
              pipelineErr
            );
          }

          results.push({
            owner: repo.owner,
            name: repo.name,
            status: "imported",
            projectId: project.id,
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          results.push({
            owner: repo.owner,
            name: repo.name,
            status: "failed",
            reason: msg,
          });
        }
      })
    )
  );

  // Preserve input order in the response so the UI can align outcome badges
  // with the original picker rows.
  const byKey = new Map<string, ImportResultRow>();
  for (const r of results) {
    byKey.set(`${r.owner.toLowerCase()}/${r.name.toLowerCase()}`, r);
  }
  const ordered = repos
    .map((r) => byKey.get(`${r.owner.toLowerCase()}/${r.name.toLowerCase()}`))
    .filter((r): r is ImportResultRow => !!r);

  return NextResponse.json({ results: ordered });
}
