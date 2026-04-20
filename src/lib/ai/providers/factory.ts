import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, projects, users } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import {
  DEFAULT_MODELS,
  validateModel,
} from "@/lib/ai/providers/allowlist";
import { AnthropicClient } from "@/lib/ai/providers/anthropic-client";
import { OpenAiClient } from "@/lib/ai/providers/openai-client";
import {
  LlmNotConfiguredError,
  type LlmClient,
  type LlmConfig,
  type LlmProvider,
} from "@/lib/ai/providers/types";

/**
 * Resolve a user's LlmClient using the Phase 3.5 fallback chain:
 *
 *   1. BYOK — all three byok* columns populated → decrypt + return.
 *   2. Platform OpenAI — env `OPENAI_API_KEY` set.
 *   3. Platform Anthropic — env `ANTHROPIC_API_KEY` set.
 *   4. Nothing → throw {@link LlmNotConfiguredError}.
 *
 * BYOK always wins. At the platform layer, OpenAI-first preserves today's
 * hosted behavior (callers used to bind directly to OpenAI).
 *
 * Typed errors bubble to the API route layer, which maps them to 409s;
 * the orchestrator catches them too and writes a structured
 * `projects.pipelineError` prefix so the UI can display a targeted CTA.
 */
export async function getLlmClientForUser(userId: string): Promise<LlmClient> {
  const config = await resolveConfigForUser(userId);
  return instantiate(config);
}

/**
 * Resolve via the project → portfolio → user traversal. Every pipeline
 * step runs in a project context, so this is the canonical entry point
 * for step-level calls.
 */
export async function getLlmClientForProject(
  projectId: string
): Promise<LlmClient> {
  const [row] = await db
    .select({ userId: portfolios.userId })
    .from(projects)
    .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) {
    throw new Error(`Project ${projectId} not found`);
  }
  return getLlmClientForUser(row.userId);
}

/**
 * Returns `true` iff there is a usable LLM config for this user. Used by
 * the dashboard layout to decide whether to render the
 * `<LlmNotConfiguredBanner />`. Never throws.
 */
export async function hasLlmConfigForUser(userId: string): Promise<boolean> {
  try {
    await resolveConfigForUser(userId);
    return true;
  } catch {
    return false;
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function resolveConfigForUser(userId: string): Promise<LlmConfig> {
  // 1. BYOK
  const [row] = await db
    .select({
      provider: users.byokProvider,
      keyEncrypted: users.byokKeyEncrypted,
      model: users.byokModel,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row?.provider && row.keyEncrypted && row.model) {
    if (
      (row.provider === "openai" || row.provider === "anthropic") &&
      validateModel(row.provider, row.model)
    ) {
      const apiKey = decryptSecret(row.keyEncrypted);
      return {
        provider: row.provider,
        apiKey,
        model: row.model,
        source: "byok",
      };
    }
    // Stored BYOK is invalid (unknown provider or disallowed model).
    // Fall through to platform env rather than throwing — we don't want a
    // stale setting to break the user's pipeline without a path forward.
  }

  // 2. Platform OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model =
      process.env.OPENAI_DEFAULT_MODEL ?? DEFAULT_MODELS.openai;
    return {
      provider: "openai",
      apiKey: openaiKey,
      model,
      source: "platform",
    };
  }

  // 3. Platform Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model =
      process.env.ANTHROPIC_DEFAULT_MODEL ?? DEFAULT_MODELS.anthropic;
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model,
      source: "platform",
    };
  }

  // 4. Nothing configured
  throw new LlmNotConfiguredError();
}

function instantiate(config: LlmConfig): LlmClient {
  switch (config.provider) {
    case "openai":
      return new OpenAiClient(config.apiKey, config.model);
    case "anthropic":
      return new AnthropicClient(config.apiKey, config.model);
    default:
      // Exhaustive check — TS will flag if we add a provider and forget here.
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
  }
}

/**
 * Internal helper exported for tests. Exposes the raw resolved config
 * (including the plaintext key) without instantiating a client.
 */
export const _internals = {
  resolveConfigForUser,
} as const;

/**
 * Expose the provider type for callers that need to know *which* provider
 * is active — e.g. the Anthropic tool-use audit banner.
 */
export type { LlmProvider };
