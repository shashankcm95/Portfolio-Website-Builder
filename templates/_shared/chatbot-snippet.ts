/**
 * Phase 8.5 — Inline chatbot bootstrap for the published portfolio.
 *
 * Replaces the Phase-5 pattern of loading `{APP_URL}/chatbot-embed.js` via
 * `<script src>`. Inlining the bootstrap eliminates the cross-origin
 * fetch — the builder can be offline, missing, or migrated, and the
 * published page still loads cleanly with zero failed requests. The
 * iframe the bootstrap creates still points at `{appOrigin}/embed/chatbot/`,
 * which by design is the one remaining coupling (the chatbot *is* an AI
 * service hosted on the builder). That load is handled gracefully via
 * the existing `iframe.onerror` — if the builder is down, the iframe
 * fails to load and the widget removes itself, leaving no visible trace.
 *
 * The legacy `public/chatbot-embed.js` stays in place so portfolios
 * generated before 8.5 keep working; it becomes dead code once no live
 * portfolio references it.
 *
 * Contract matches the legacy script almost exactly:
 *   - Mount a fixed-position iframe at bottom-right.
 *   - Listen for `chatbot-resize` / `chatbot-theme` postMessage events.
 *   - Remove the iframe on load failure.
 *   - No-op on second run (idempotent).
 */

export interface ChatbotSnippetOptions {
  /**
   * Origin of the builder app — e.g. `https://portfolio.example.com`.
   * Required when `selfHosted` is false (the Phase 8.5 default); ignored
   * when `selfHosted` is true (the iframe lives at the same origin).
   */
  appOrigin: string;
  /** The portfolio id whose chat corpus should drive the widget. */
  portfolioId: string;
  /**
   * Phase 9 — when true, the iframe points at `/chat.html` on the same
   * origin as the published portfolio (served by Cloudflare Pages with
   * a co-deployed Pages Function handling `/api/chat/stream`). The
   * published site becomes fully independent of the builder app. When
   * false or omitted, the Phase 8.5 behavior holds.
   */
  selfHosted?: boolean;
}

/**
 * Build the minified `<script>` body Layout.tsx injects via
 * `dangerouslySetInnerHTML`. Returns an empty string when gates fail so
 * the caller can conditionally omit the script tag.
 *
 * Two shapes — selected by `options.selfHosted`:
 *
 *   selfHosted: false (Phase 8.5)
 *     iframe.src = `${appOrigin}/embed/chatbot/${portfolioId}`.
 *     Requires the builder to be reachable; widget self-removes on
 *     load failure.
 *
 *   selfHosted: true (Phase 9)
 *     iframe.src = `/chat.html` on the published site's own origin.
 *     The Pages deploy ships a Pages Function at `/api/chat/stream`
 *     backed by Cloudflare Workers AI. Fully independent of the
 *     builder.
 */
export function buildChatbotSnippet(
  options: ChatbotSnippetOptions
): string {
  if (!options.portfolioId) return "";
  const selfHosted = options.selfHosted === true;

  if (!selfHosted && !options.appOrigin) return "";

  const pid = JSON.stringify(options.portfolioId).replace(
    /<\/(script)/gi,
    "<\\/$1"
  );

  // Phase R7 — when the iframe load or readiness probe fails, emit a
  // single console.warn before cleanup. The widget already removes
  // itself silently on failure (Phase 8.5 behavior), but silent
  // removal is hard to debug — the operator sees nothing in DevTools
  // and can't distinguish "chatbot disabled" from "chatbot broken".
  // The warn names the iframe target and the most likely fix.

  if (selfHosted) {
    // Same-origin variant. `iframeSrc = "/chat.html"` — no appOrigin
    // needed. `validMessageOrigin` is the current page's origin, read
    // at runtime.
    return `(function(){try{if(typeof window==="undefined"||typeof document==="undefined")return;if(window.__pwChatbotMounted)return;window.__pwChatbotMounted=1;var pid=${pid};if(document.getElementById("portfolio-chatbot-iframe"))return;var CLOSED={w:72,h:72},OPEN={w:400,h:600};var f=document.createElement("iframe");f.id="portfolio-chatbot-iframe";f.title="Portfolio chatbot";f.src="/chat.html";f.setAttribute("loading","lazy");f.setAttribute("scrolling","no");f.style.cssText=["position:fixed","bottom:16px","right:16px","width:"+CLOSED.w+"px","height:"+CLOSED.h+"px","border:0","background:transparent","color-scheme:light","z-index:2147483646","transition:width 180ms ease, height 180ms ease","box-shadow:none","pointer-events:auto"].join(";");function mount(){if(document.body){document.body.appendChild(f);}else{document.addEventListener("DOMContentLoaded",function once(){document.removeEventListener("DOMContentLoaded",once);if(document.body)document.body.appendChild(f);});}}mount();var removed=false;function warn(why){try{console.warn("[portfolio-chatbot] iframe failed to load",{src:"/chat.html",reason:why,hint:"The /chat.html page or /api/chat/stream Pages Function may not have deployed. Re-run the deploy with selfHostedChatbot enabled and check Cloudflare Pages Functions logs."});}catch(e){}}function cleanup(why){if(removed)return;removed=true;if(why)warn(why);try{f.parentNode&&f.parentNode.removeChild(f);}catch(e){}}f.addEventListener("error",function(){cleanup("error event");});var readinessTimer=setTimeout(function(){try{if(!f.contentWindow)cleanup("readiness timeout (5s)");}catch(e){cleanup("readiness timeout threw");}},5000);f.addEventListener("load",function(){clearTimeout(readinessTimer);});function applySize(open){var t=open?OPEN:CLOSED;f.style.width=t.w+"px";f.style.height=t.h+"px";if(open&&window.innerWidth<480){f.style.width="100vw";f.style.height="100vh";f.style.bottom="0";f.style.right="0";}else{f.style.bottom="16px";f.style.right="16px";}}window.addEventListener("message",function(e){if(e.origin!==window.location.origin)return;var d=e.data;if(!d||typeof d!=="object")return;if(d.type==="chatbot-resize"){applySize(!!d.open);}});void pid;}catch(e){}})();`;
  }

  // Phase 8.5 cross-origin variant.
  const origin = JSON.stringify(options.appOrigin).replace(
    /<\/(script)/gi,
    "<\\/$1"
  );
  return `(function(){try{if(typeof window==="undefined"||typeof document==="undefined")return;if(window.__pwChatbotMounted)return;window.__pwChatbotMounted=1;var origin=${origin},pid=${pid};if(document.getElementById("portfolio-chatbot-iframe"))return;var CLOSED={w:72,h:72},OPEN={w:400,h:600};var f=document.createElement("iframe");f.id="portfolio-chatbot-iframe";f.title="Portfolio chatbot";f.src=origin+"/embed/chatbot/"+encodeURIComponent(pid);f.setAttribute("loading","lazy");f.setAttribute("scrolling","no");f.style.cssText=["position:fixed","bottom:16px","right:16px","width:"+CLOSED.w+"px","height:"+CLOSED.h+"px","border:0","background:transparent","color-scheme:light","z-index:2147483646","transition:width 180ms ease, height 180ms ease","box-shadow:none","pointer-events:auto"].join(";");function mount(){if(document.body){document.body.appendChild(f);}else{document.addEventListener("DOMContentLoaded",function once(){document.removeEventListener("DOMContentLoaded",once);if(document.body)document.body.appendChild(f);});}}mount();var removed=false;function warn(why){try{console.warn("[portfolio-chatbot] iframe failed to load",{src:origin+"/embed/chatbot/"+pid,reason:why,hint:"The builder app at "+origin+" is not reachable from this site. Either expose the builder publicly via NEXT_PUBLIC_APP_URL, or enable selfHostedChatbot so the chatbot deploys alongside the portfolio (Phase 9)."});}catch(e){}}function cleanup(why){if(removed)return;removed=true;if(why)warn(why);try{f.parentNode&&f.parentNode.removeChild(f);}catch(e){}}f.addEventListener("error",function(){cleanup("error event");});var readinessTimer=setTimeout(function(){try{if(!f.contentWindow)cleanup("readiness timeout (5s)");}catch(e){cleanup("readiness timeout threw");}},5000);f.addEventListener("load",function(){clearTimeout(readinessTimer);});function applySize(open){var t=open?OPEN:CLOSED;f.style.width=t.w+"px";f.style.height=t.h+"px";if(open&&window.innerWidth<480){f.style.width="100vw";f.style.height="100vh";f.style.bottom="0";f.style.right="0";}else{f.style.bottom="16px";f.style.right="16px";}}window.addEventListener("message",function(e){if(e.origin!==origin)return;var d=e.data;if(!d||typeof d!=="object")return;if(d.type==="chatbot-resize"){applySize(!!d.open);}});}catch(e){}})();`;
}
