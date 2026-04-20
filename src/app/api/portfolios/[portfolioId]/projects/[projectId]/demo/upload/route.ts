import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects } from "@/lib/db/schema";
import { R2UploadError, putObject } from "@/lib/storage/r2";

/**
 * POST /api/portfolios/:portfolioId/projects/:projectId/demo/upload
 *
 * Server-proxied upload: client sends multipart/form-data with a single
 * `file` field; we validate, push to R2, and return the public URL.
 *
 * Does NOT create a `project_demos` row — the client appends the
 * returned URL to its local draft list and the existing PUT /demo saves
 * everything atomically. This keeps draft-then-save semantics consistent
 * with Phase 4's Save flow.
 *
 * Status codes:
 *   200 - { url, bytes, contentType }
 *   400 - missing file, too large, or MIME not in allowlist
 *   401 - unauthenticated
 *   403 - project belongs to another user
 *   404 - project or portfolio not found
 *   503 - R2 not configured (check /api/uploads/config)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string; projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership traversal: project → portfolio → user
  const [row] = await db
    .select({
      projectId: projects.id,
      portfolioUserId: portfolios.userId,
    })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(portfolios.id, params.portfolioId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.portfolioUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse multipart/form-data — native Next.js App Router support.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  try {
    const result = await putObject({
      userId: session.user.id,
      projectId: params.projectId,
      file,
    });
    return NextResponse.json({
      url: result.url,
      bytes: result.bytes,
      contentType: result.contentType,
    });
  } catch (e) {
    if (e instanceof R2UploadError) {
      if (e.code === "not_configured") {
        return NextResponse.json(
          { error: e.message, code: e.code },
          { status: 503 }
        );
      }
      if (
        e.code === "too_large" ||
        e.code === "bad_mime" ||
        e.code === "missing_file"
      ) {
        return NextResponse.json(
          { error: e.message, code: e.code },
          { status: 400 }
        );
      }
      // put_failed — infrastructure error; log and surface a 500.
      console.error("[upload] R2 put failed:", e.message);
      return NextResponse.json(
        { error: "Upload failed — please try again" },
        { status: 500 }
      );
    }
    console.error("[upload] unexpected:", e);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
