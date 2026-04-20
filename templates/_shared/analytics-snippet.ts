/**
 * Phase 6 — Analytics beacon snippet for the published portfolio.
 *
 * Exposes a single function that returns the `<script>` body string
 * Layout.tsx injects via `dangerouslySetInnerHTML`. Keep this tiny and
 * self-contained — it runs on the owner's published site, not on our
 * app.
 *
 * Contract:
 *   - `navigator.sendBeacon()` is used so the request doesn't block
 *     navigation (fire-and-forget, no response needed).
 *   - Falls back to `fetch(..., {keepalive: true})` for older browsers.
 *   - No-op when called in an SSR / test context (guards on `typeof
 *     navigator` + `typeof window`).
 *   - Only fires once per page load, even if the script re-runs.
 */

export interface AnalyticsSnippetOptions {
  /** `${APP_URL}/api/events/track`. When empty string, snippet is a no-op. */
  apiUrl: string;
  portfolioId: string;
}

/**
 * Build the `<script>` body for the analytics beacon. Returns an empty
 * string when `apiUrl` is unset — Layout then skips the script tag
 * entirely so the published site has zero analytics dependencies when
 * NEXT_PUBLIC_APP_URL isn't configured at build time.
 */
export function buildAnalyticsSnippet(
  options: AnalyticsSnippetOptions
): string {
  if (!options.apiUrl || !options.portfolioId) return "";

  // Minified IIFE — JSON.stringify on the literal url + id is the easy
  // way to insert them safely into the script body without escaping
  // headaches.
  const url = JSON.stringify(options.apiUrl);
  const pid = JSON.stringify(options.portfolioId);

  return `(function(){try{if(typeof navigator==="undefined"||window.__pwAnalyticsFired)return;window.__pwAnalyticsFired=1;var body=JSON.stringify({portfolioId:${pid},path:location.pathname,referrer:document.referrer||null,eventType:"pageview"});var url=${url};if(navigator.sendBeacon){var blob=new Blob([body],{type:"application/json"});navigator.sendBeacon(url,blob);}else{fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true}).catch(function(){});}}catch(e){}})();`;
}
