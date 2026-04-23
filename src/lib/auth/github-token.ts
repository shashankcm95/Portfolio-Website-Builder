/**
 * Phase R1 — GitHub OAuth token at-rest encryption.
 *
 * The token column (`users.github_token`) historically stored the
 * access_token as plaintext. That meant a read-only DB leak handed the
 * attacker repo-scope tokens for every user. BYOK LLM keys already flow
 * through `secret-box.encryptSecret` / `decryptSecret`; this module
 * applies the same treatment to GitHub tokens.
 *
 * Format note: encrypted values start with the literal prefix `"v1:"`
 * (see `secret-box.ts`). GitHub OAuth tokens start with `ghp_`, `gho_`,
 * `ghu_`, or `ghs_`. The two namespaces don't overlap, so a single
 * `startsWith("v1:")` check cleanly discriminates encrypted vs legacy
 * plaintext without requiring a migration job.
 *
 * Migration strategy: **self-healing on next sign-in**. Existing
 * plaintext rows keep working (decryption is a no-op pass-through via
 * `readGitHubToken`) and are rewritten as ciphertext the next time the
 * user re-authenticates. No flag day, no backfill script.
 *
 * **Edge-runtime note.** `secret-box.ts` imports `node:crypto`, which
 * isn't available in the Edge runtime. Because `auth/index.ts` is
 * statically reachable from `middleware.ts` (Edge), any static import
 * from this module to secret-box pollutes the Edge bundle with a
 * forbidden dep. We therefore dynamic-import secret-box inside each
 * function body — callers (auth callback, authenticated-client) run in
 * the Node runtime, so the dynamic import resolves at call time without
 * breaking Edge analysis.
 */

const CIPHER_PREFIX = "v1:";

/**
 * Encrypt a GitHub OAuth token for DB storage. Called only from the
 * auth-callback (`signIn`) — that's the single write site.
 *
 * If encryption fails (e.g. `ENCRYPTION_KEY` missing in dev), we return
 * null rather than falling back to plaintext. The caller stores null
 * and the app degrades to the unauthenticated GitHub client (60 req/h).
 * That's a louder, safer failure than silently persisting a cleartext
 * token when the operator believes encryption is active.
 */
export async function encryptGitHubTokenForStorage(
  plaintext: string
): Promise<string | null> {
  if (!plaintext) return null;
  try {
    const { encryptSecret } = await import("@/lib/crypto/secret-box");
    return encryptSecret(plaintext);
  } catch {
    return null;
  }
}

/**
 * Read a GitHub token from the DB value.
 *
 * - If the value starts with the cipher prefix, decrypt it.
 * - If the value looks like legacy plaintext (no prefix), return as-is.
 * - On decrypt error, return null so the caller falls back to
 *   unauthenticated. We prefer degraded behavior over crashing.
 *
 * Callers must never log the returned token; pass it straight to
 * `GitHubClient`.
 */
export async function readGitHubToken(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith(CIPHER_PREFIX)) {
    // Legacy plaintext. Still valid; will be re-written encrypted on next
    // sign-in by the auth callback.
    return stored;
  }
  try {
    const { decryptSecret, SecretDecryptError } = await import(
      "@/lib/crypto/secret-box"
    );
    try {
      return decryptSecret(stored);
    } catch (err) {
      if (err instanceof SecretDecryptError) {
        // Key rotation / tampering / corruption — clear log, no secret
        // in the message (SecretDecryptError never includes the token).
        console.warn(
          "[github-token] decrypt failed, treating as absent:",
          err.message
        );
      }
      return null;
    }
  } catch {
    // secret-box module itself failed to load (missing ENCRYPTION_KEY at
    // worst). Fall back to absent rather than crashing.
    return null;
  }
}

/**
 * Test-only helper — exposed so an operator can check whether a stored
 * value is already in ciphertext form. Not used at runtime.
 */
export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(CIPHER_PREFIX);
}
