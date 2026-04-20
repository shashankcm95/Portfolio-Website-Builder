import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { GitHubClient } from "@/lib/github/client";

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

    const token = row?.githubToken ?? undefined;
    return new GitHubClient(token || undefined);
  } catch {
    // DB unavailable at call time — degrade gracefully to unauthenticated.
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
    // Best-effort — not critical enough to surface.
  }
}
