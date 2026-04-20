/**
 * @deprecated — these helpers are now thin shims over the Phase 3.5
 * pluggable-provider layer. Prefer getting a concrete `LlmClient` via
 * `getLlmClientForUser(userId)` or `getLlmClientForProject(projectId)`
 * and calling `client.structured(...)` / `client.text(...)` directly.
 *
 * The shims exist purely to minimize diff surface while call sites are
 * migrated. They require a `userId` so the factory can resolve BYOK →
 * platform env → typed error. Call sites that can thread a `LlmClient`
 * instance should; call sites that can't (yet) should call the shim.
 *
 * The file name and export names are preserved for historical reasons
 * (this module used to target Anthropic's Claude directly before we
 * pivoted to OpenAI); don't let the naming mislead you.
 */

import { getLlmClientForUser } from "@/lib/ai/providers/factory";
import type {
  JsonSchemaSpec,
  LlmStructuredArgs,
  LlmTextArgs,
} from "@/lib/ai/providers/types";

export async function callClaude(
  args: LlmTextArgs & { userId: string }
): Promise<string> {
  const { userId, ...rest } = args;
  const client = await getLlmClientForUser(userId);
  return client.text(rest);
}

export async function callClaudeStructured<T>(
  args: LlmStructuredArgs & { userId: string }
): Promise<T> {
  const { userId, ...rest } = args;
  const client = await getLlmClientForUser(userId);
  return client.structured<T>(rest);
}

export type { JsonSchemaSpec };
