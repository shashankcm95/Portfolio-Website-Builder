import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/secret-box";
import {
  getModelsFor,
  validateModel,
} from "@/lib/ai/providers/allowlist";
import { validateKey } from "@/lib/ai/providers/validate-key";
import { hasLlmConfigForUser } from "@/lib/ai/providers/factory";
import type {
  BYOKSettings,
  LlmProvider,
} from "@/lib/ai/providers/types";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/llm
 * Returns the user's current BYOK settings WITHOUT the plaintext key.
 *
 * Response shape matches `BYOKSettings`:
 *   { provider, model, hasKey, lastValidatedAt, lastFailureAt, lastFailureReason }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({
      provider: users.byokProvider,
      keyEncrypted: users.byokKeyEncrypted,
      model: users.byokModel,
      lastValidatedAt: users.byokKeyLastValidatedAt,
      lastFailureAt: users.byokKeyLastFailureAt,
      lastFailureReason: users.byokKeyLastFailureReason,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const settings: BYOKSettings = {
    provider: (row?.provider as LlmProvider | null) ?? null,
    model: row?.model ?? null,
    hasKey: !!row?.keyEncrypted,
    lastValidatedAt: row?.lastValidatedAt?.toISOString() ?? null,
    lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: row?.lastFailureReason ?? null,
  };

  // Include a `configured` boolean combining BYOK + platform env, so the
  // dashboard banner doesn't have to infer from env vars client-side.
  const configured = await hasLlmConfigForUser(session.user.id);

  return NextResponse.json({ ...settings, configured });
}

/**
 * PUT /api/settings/llm
 * Body: `{ provider, apiKey, model }`.
 *
 * Flow:
 *   1. Auth.
 *   2. Validate provider + model against allowlist.
 *   3. Fire a ~8-token test call to confirm the key works.
 *   4. On success: encrypt + persist; write `byokKeyLastValidatedAt`.
 *   5. On failure: record `byokKeyLastFailureAt/Reason` but do NOT touch
 *      `byokKeyEncrypted` (so a bad retry doesn't nuke a working key).
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: string; apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { provider, apiKey, model } = body;

  if (provider !== "openai" && provider !== "anthropic") {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 }
    );
  }
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
    return NextResponse.json(
      { error: "API key is required" },
      { status: 400 }
    );
  }
  if (!model || !validateModel(provider, model)) {
    return NextResponse.json(
      {
        error: `Model "${model ?? ""}" is not on the ${provider} allowlist`,
        allowed: getModelsFor(provider),
      },
      { status: 400 }
    );
  }

  const trimmedKey = apiKey.trim();
  const result = await validateKey(provider, trimmedKey, model);
  const now = new Date();

  if (!result.ok) {
    // Record the failure so the UI can explain why the key didn't take.
    // Do NOT write `byokKeyEncrypted` — a prior good key stays in place.
    await db
      .update(users)
      .set({
        byokKeyLastFailureAt: now,
        byokKeyLastFailureReason: result.reason,
        updatedAt: now,
      })
      .where(eq(users.id, session.user.id));
    return NextResponse.json(
      { error: result.reason, category: result.category },
      { status: 400 }
    );
  }

  // Encrypt + persist on success.
  const encrypted = encryptSecret(trimmedKey);
  await db
    .update(users)
    .set({
      byokProvider: provider,
      byokKeyEncrypted: encrypted,
      byokModel: model,
      byokKeyLastValidatedAt: now,
      byokKeyLastFailureAt: null,
      byokKeyLastFailureReason: null,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  const settings: BYOKSettings = {
    provider,
    model,
    hasKey: true,
    lastValidatedAt: now.toISOString(),
    lastFailureAt: null,
    lastFailureReason: null,
  };
  return NextResponse.json(settings);
}

/**
 * DELETE /api/settings/llm
 * Clears all six BYOK columns. Next LLM call falls back to platform env
 * or returns `LlmNotConfiguredError` if no platform key is set.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      byokProvider: null,
      byokKeyEncrypted: null,
      byokModel: null,
      byokKeyLastValidatedAt: null,
      byokKeyLastFailureAt: null,
      byokKeyLastFailureReason: null,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
