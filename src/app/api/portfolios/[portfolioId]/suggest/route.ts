/**
 * Phase E7 — Identity-field AI suggester.
 *
 * POST /api/portfolios/:portfolioId/suggest
 *   body: { field, seed?, count? }
 *   returns: { field, suggestions[] }
 *
 * The route is owner-only (authorizePortfolio); we never want a
 * visitor to be able to burn LLM tokens on someone else's portfolio.
 *
 * Failure modes are mapped to HTTP status carefully so the editor UI
 * can render the right error chip:
 *   - 400 no_llm_config    → owner has no provider key set; tell
 *                            them to configure one
 *   - 401 invalid_llm_key  → key set but rejected; tell them to
 *                            update it
 *   - 502 llm_error        → provider returned a non-key error
 *                            (rate-limit, malformed JSON, etc.)
 *   - 404 not_found        → portfolio doesn't exist (shouldn't
 *                            happen post-authorize but we defend)
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizePortfolio } from "@/lib/auth/authorize-portfolio";
import { suggestRequestSchema } from "@/lib/identity/suggest/types";
import { suggestField } from "@/lib/identity/suggest/suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  const authz = await authorizePortfolio(params.portfolioId);
  if (authz.error) return authz.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "bad_request" },
      { status: 400 }
    );
  }

  const parsed = suggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "bad_request",
      },
      { status: 400 }
    );
  }

  const result = await suggestField({
    portfolioId: params.portfolioId,
    field: parsed.data.field,
    seed: parsed.data.seed,
    count: parsed.data.count,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status }
    );
  }
  return NextResponse.json(result.response);
}
