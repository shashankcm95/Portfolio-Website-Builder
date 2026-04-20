/**
 * Redact secrets from strings before they end up in error messages, logs,
 * or traces. Applied at every error-logging boundary in the provider
 * clients and orchestrator error paths — load-bearing for "user-supplied
 * API keys never leak" security posture.
 *
 * Masks:
 *   - OpenAI-style `sk-…` keys
 *   - Anthropic-style `sk-ant-…` keys
 *   - An explicit secret passed in by the caller (for the rare case where
 *     we know the exact string we're trying to protect)
 *
 * Leaves the surrounding text untouched so the error remains debuggable.
 */

// Generic match for OpenAI / Anthropic API keys. Conservative: minimum 20
// non-whitespace characters after `sk-` so we don't mangle harmless strings
// that happen to contain "sk-" (e.g. "risk-management"). Handles both the
// `sk-proj-...`, `sk-ant-...`, and classic `sk-...` shapes.
const SECRET_PATTERN = /\bsk-(?:ant-)?(?:[A-Za-z0-9_-]{20,})\b/g;

const MASK = "***";

export function redactSecret(
  input: string | undefined | null,
  explicit?: string
): string {
  if (input == null) return "";
  let out = input.replace(SECRET_PATTERN, MASK);
  if (explicit && explicit.length >= 8) {
    // Escape regex metacharacters in the explicit secret before replacing.
    const escaped = explicit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), MASK);
  }
  return out;
}
