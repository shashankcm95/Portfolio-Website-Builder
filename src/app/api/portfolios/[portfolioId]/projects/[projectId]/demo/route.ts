import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectDemos } from "@/lib/db/schema";
import { authorizeProject } from "@/lib/auth/authorize-portfolio";
import { detectDemoType } from "@/lib/demos/platform-detect";
import { putDemosBodySchema } from "@/lib/demos/validation";
import type { DemoType, ProjectDemo } from "@/lib/demos/types";
import { deleteObject, isOurObject } from "@/lib/storage/r2";
import { fetchOembed, type OembedProvider } from "@/lib/demos/oembed";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 4.2 — enrichment TTL + timebox.
const OEMBED_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ENRICHMENT_DEADLINE_MS = 3000;
const OEMBED_TYPES = new Set<DemoType>(["youtube", "loom", "vimeo"]);

/**
 * GET /api/portfolios/:portfolioId/projects/:projectId/demo
 *   → { demos: ProjectDemo[] }  (ordered by `order` ASC)
 *
 * PUT  body: { demos: [{ url, title? }, ...] }
 *   Idempotent "replace full list" semantics. Runs inside a transaction:
 *   DELETE all prior rows, INSERT the new list with `order = index`. Type
 *   is detected per-URL and cached in the row.
 *   → { demos: ProjectDemo[] }
 *
 * DELETE
 *   Removes all demos for this project. → 204
 *
 * Auth + ownership: project → portfolio → user, matching the pattern in
 * credibility/refresh/route.ts.
 */

function toProjectDemo(row: typeof projectDemos.$inferSelect): ProjectDemo {
  return {
    id: row.id,
    url: row.url,
    type: row.type as DemoType,
    title: row.title,
    order: row.order,
    thumbnailUrl: row.thumbnailUrl ?? null,
    oembedTitle: row.oembedTitle ?? null,
    oembedFetchedAt: row.oembedFetchedAt
      ? row.oembedFetchedAt instanceof Date
        ? row.oembedFetchedAt.toISOString()
        : String(row.oembedFetchedAt)
      : null,
  };
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const authz = await authorizeProject(params.portfolioId, params.projectId);
  if (authz.error) return authz.error;

  const rows = await db
    .select()
    .from(projectDemos)
    .where(eq(projectDemos.projectId, params.projectId))
    .orderBy(asc(projectDemos.order));

  return NextResponse.json({ demos: rows.map(toProjectDemo) });
}

// ─── PUT ────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const authResult = await authorizeProject(
    params.portfolioId,
    params.projectId
  );
  if (authResult.error) return authResult.error;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = putDemosBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const valuesToInsert = parsed.data.demos.map((d, i) => ({
    projectId: params.projectId,
    url: d.url.trim(),
    type: detectDemoType(d.url) as string,
    title: d.title ?? null,
    order: i,
  }));

  // Capture old URLs + enrichment cache BEFORE the transaction. The URLs
  // drive R2 cleanup; the enrichment columns power Phase 4.2's copy-
  // forward optimization (unchanged URL + fresh cache → skip refetch).
  const oldRows = await db
    .select({
      url: projectDemos.url,
      thumbnailUrl: projectDemos.thumbnailUrl,
      oembedTitle: projectDemos.oembedTitle,
      oembedFetchedAt: projectDemos.oembedFetchedAt,
    })
    .from(projectDemos)
    .where(eq(projectDemos.projectId, params.projectId));
  const oldUrlSet = new Set(oldRows.map((r) => r.url));
  const oldEnrichmentByUrl = new Map(oldRows.map((r) => [r.url, r]));
  const newUrlSet = new Set(valuesToInsert.map((v) => v.url));

  // Transaction: wipe prior list and replace. If the insert fails mid-way
  // the prior list is preserved.
  const newRows = await db.transaction(async (tx) => {
    await tx
      .delete(projectDemos)
      .where(eq(projectDemos.projectId, params.projectId));

    if (valuesToInsert.length === 0) return [];

    return await tx
      .insert(projectDemos)
      .values(valuesToInsert)
      .returning();
  });

  // Phase 4.1 — Cleanup: best-effort DeleteObject for any R2-hosted URL
  // the user dropped from the list. Non-fatal; we don't block the response
  // on R2 availability. External URLs (Loom, YouTube, Imgur, etc.) are
  // ignored — `isOurObject` returns false for anything not on our bucket.
  const removedUrls = [...oldUrlSet].filter((u) => !newUrlSet.has(u));
  await Promise.allSettled(
    removedUrls.filter(isOurObject).map((u) => deleteObject(u))
  );

  // Phase 4.2 — oEmbed enrichment. Runs after the transaction commits so
  // the list is durable even if every provider is down. Copy-forward
  // from the prior row when URL is unchanged + cache is fresh; else
  // fetch live. Timeboxed to 3s total — slow providers don't block the
  // response; their thumbnails backfill on the next PUT or GET.
  const enrichableRows = newRows.filter((r) =>
    OEMBED_TYPES.has(r.type as DemoType)
  );

  if (enrichableRows.length > 0) {
    const writeCounter = { count: 0 };
    const enrichmentWork = Promise.allSettled(
      enrichableRows.map((row) =>
        enrichOne(row, oldEnrichmentByUrl, writeCounter)
      )
    );
    await Promise.race([
      enrichmentWork,
      new Promise<void>((resolve) =>
        setTimeout(resolve, ENRICHMENT_DEADLINE_MS)
      ),
    ]);

    // Re-read only if at least one enrichment wrote, so unchanged tests
    // don't pay the extra roundtrip.
    if (writeCounter.count > 0) {
      const refreshed = await db
        .select()
        .from(projectDemos)
        .where(eq(projectDemos.projectId, params.projectId))
        .orderBy(asc(projectDemos.order));
      return NextResponse.json({ demos: refreshed.map(toProjectDemo) });
    }
  }

  return NextResponse.json({ demos: newRows.map(toProjectDemo) });
}

/**
 * Copy-forward when URL + fresh cache, else live-fetch and persist.
 * Swallows all errors — enrichment is strictly non-fatal. Increments
 * `writeCounter.count` on successful persist so the caller knows whether
 * to refresh its row list.
 */
async function enrichOne(
  row: typeof projectDemos.$inferSelect,
  oldByUrl: Map<
    string,
    {
      url: string;
      thumbnailUrl: string | null;
      oembedTitle: string | null;
      oembedFetchedAt: Date | null;
    }
  >,
  writeCounter: { count: number }
): Promise<void> {
  try {
    const cached = oldByUrl.get(row.url);
    const now = Date.now();

    // Copy-forward: same URL, cache still fresh.
    if (
      cached &&
      cached.thumbnailUrl &&
      cached.oembedFetchedAt &&
      now - new Date(cached.oembedFetchedAt).getTime() < OEMBED_CACHE_TTL_MS
    ) {
      await db
        .update(projectDemos)
        .set({
          thumbnailUrl: cached.thumbnailUrl,
          oembedTitle: cached.oembedTitle,
          oembedFetchedAt: cached.oembedFetchedAt,
        })
        .where(eq(projectDemos.id, row.id));
      writeCounter.count += 1;
      return;
    }

    // Live fetch. Null on any failure → no update, retry next save.
    const result = await fetchOembed(row.type as OembedProvider, row.url);
    if (!result) return;

    await db
      .update(projectDemos)
      .set({
        thumbnailUrl: result.thumbnailUrl,
        oembedTitle: result.title,
        oembedFetchedAt: new Date(),
      })
      .where(eq(projectDemos.id, row.id));
    writeCounter.count += 1;
  } catch {
    // Non-fatal by design. Bad rows simply remain unenriched.
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const authz = await authorizeProject(params.portfolioId, params.projectId);
  if (authz.error) return authz.error;

  // Capture URLs before the SQL delete so we know which R2 objects to
  // clean up. Non-fatal — we swallow R2 errors and still return 204.
  const rows = await db
    .select({ url: projectDemos.url })
    .from(projectDemos)
    .where(eq(projectDemos.projectId, params.projectId));

  await db
    .delete(projectDemos)
    .where(eq(projectDemos.projectId, params.projectId));

  // Phase 4.1 — best-effort R2 cleanup for the wiped URLs.
  await Promise.allSettled(
    rows.map((r) => r.url).filter(isOurObject).map((u) => deleteObject(u))
  );

  return new NextResponse(null, { status: 204 });
}
