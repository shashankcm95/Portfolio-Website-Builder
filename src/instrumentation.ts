/**
 * Phase R1 — Server boot-time hook.
 *
 * Next.js calls `register()` exactly once when the Node server starts,
 * before any request is handled. We use it as a lightweight startup
 * validator so misconfiguration surfaces as a boot error rather than as
 * a mysterious 500 on the first request that needs a secret.
 *
 * Checks:
 *   - `ENCRYPTION_KEY` is present and decodes to the expected length.
 *     BYOK LLM keys, GitHub OAuth tokens, and future at-rest-encrypted
 *     columns all depend on it. Booting without it means every write
 *     path that touches a secret will silently degrade or crash on
 *     the first user action.
 *
 * Runs only in the Node.js runtime. The Edge / middleware runtime
 * doesn't expose Node crypto in the way `master-key.ts` requires, and
 * the instrumentation file is a no-op on Edge by design (the runtime
 * gate below).
 *
 * We deliberately `console.error` and `throw` rather than calling
 * `process.exit` — Next.js wraps boot and will surface the thrown
 * error as a startup failure with a full stack, which is the right
 * signal for operators.
 */

export async function register(): Promise<void> {
  // Only run in the Node runtime. Edge runtime doesn't have Node's
  // crypto API the same way and isn't the place to guard persisted
  // secrets.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getMasterKey, MissingMasterKeyError, InvalidMasterKeyError } =
    await import("@/lib/crypto/master-key");

  try {
    getMasterKey();
  } catch (err) {
    if (err instanceof MissingMasterKeyError) {
      console.error(
        "\n[boot] ENCRYPTION_KEY is missing. BYOK LLM keys and stored " +
          "GitHub OAuth tokens cannot be read or written without it.\n" +
          "Generate one with:  openssl rand -base64 32\n" +
          "Then add ENCRYPTION_KEY=<value> to your environment.\n"
      );
    } else if (err instanceof InvalidMasterKeyError) {
      console.error(
        `\n[boot] ENCRYPTION_KEY is malformed: ${err.message}\n` +
          "Regenerate with:  openssl rand -base64 32\n"
      );
    } else {
      console.error("[boot] Key validation failed:", err);
    }
    throw err;
  }
}
