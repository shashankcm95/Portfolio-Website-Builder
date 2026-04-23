/**
 * Centralized accessor for `NEXT_PUBLIC_APP_URL`.
 *
 * Trim whitespace and strip trailing slashes so callers can safely
 * interpolate `${appUrl}/some/path`. Returns `null` (not an empty
 * string) when the env var is unset or blank — callers must branch on
 * null-ness so accidental `${""}/foo` never ships into generated
 * sites or beacon URLs.
 *
 * Not cached. The normalization is O(url-length) and runs at most
 * once per request on paths that already do Postgres round-trips;
 * the micro-saving from caching isn't worth the test-setup headaches
 * (several tests mutate `process.env.NEXT_PUBLIC_APP_URL` between
 * cases). If this ever shows up on a flamegraph we can reintroduce a
 * cache with a reset hook.
 *
 * Templates under `templates/**` and Cloudflare Pages Functions under
 * `functions/**` read their own env at build/runtime and do NOT use
 * this helper.
 */
export function getAppUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  return raw.length > 0 ? raw : null;
}
