import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { GitHubClient } from "@/lib/github/client";
import { readGitHubToken } from "@/lib/auth/github-token";
import { logger } from "@/lib/log";

/**
 * Construct a {@link GitHubClient} pre-loaded with the signed-in user's
 * stored GitHub OAuth access token (if we have one).
 *
 * Why this exists:
 * - Auth.js stores `account.access_token` into `users.githubToken` on
 *   sign-in (see `src/lib/auth/index.ts`). But every existing code path
 *   instantiated `new GitHubClient()` unauthenticated, so we've been
 *   living on the shared server-IP 60-req/h bucket. Threading the user
 *   token moves authenticated users to their own 5000-req/h bucket,
 *   which Phase 1's fan-out requires.
 *
 * On a 401 (revoked / expired token) the caller should clear the stored
 * token and retry unauthenticated; that concern lives in the caller, not
 * here, because each caller makes different downstream decisions.
 */
export async function getAuthenticatedGitHubClient(
  userId: string
): Promise<GitHubClient> {
  try {
    const [row] = await db
      .select({ githubToken: users.githubToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Phase R1 — the DB value may be ciphertext (new writes) or legacy
    // plaintext (pre-R1 rows). `readGitHubToken` discriminates and
    // decrypts transparently, returning null on failure so we degrade
    // to the unauthenticated 60-req/h bucket instead of crashing.
    const token = await readGitHubToken(row?.githubToken);
    return new GitHubClient(token || undefined);
  } catch (err) {
    // DB unavailable at call time — degrade gracefully to unauthenticated.
    // Log the failure so operators can see rate-limit regressions aren't
    // a stealth DB outage.
    logger.warn("[github/authenticated-client] DB lookup failed; falling back to unauthenticated GitHub client", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new GitHubClient();
  }
}

/**
 * Clear the stored GitHub token for a user — called when we observe a 401
 * from the GitHub API indicating the token was revoked. The next fetch
 * will fall back to unauthenticated until they sign in again.
 */
export async function clearStaleGitHubToken(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({ githubToken: null })
      .where(eq(users.id, userId));
  } catch {
    // Best-effort cleanup; next sign-in will also overwrite the stale
    // token, so a transient DB blip here is not worth surfacing.
  }
}
