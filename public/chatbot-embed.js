/**
 * Phase 5 — Visitor chatbot bootstrap script.
 *
 * This is served statically from the portfolio-builder app origin (NOT
 * from the user's published site). The published portfolio's Layout.tsx
 * includes it like so:
 *
 *   <script src="https://{app}/chatbot-embed.js"
 *           data-portfolio-id="..." async defer></script>
 *
 * All it does: inject a fixed-position iframe pointing at the app's
 * `/embed/chatbot/{portfolioId}` page, and resize it based on
 * postMessage events from that iframe. No framework, no bundler — this
 * script runs in the published site's DOM and should stay tiny.
 */

(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Find our own <script> tag so we can read data-portfolio-id + origin.
  // Prefer `document.currentScript` (supported in modern browsers); fall
  // back to scanning for any script with a data-portfolio-id attribute.
  var script =
    document.currentScript ||
    (function () {
      var tags = document.getElementsByTagName("script");
      for (var i = tags.length - 1; i >= 0; i--) {
        if (tags[i].getAttribute("data-portfolio-id")) return tags[i];
      }
      return null;
    })();

  if (!script) return;
  var portfolioId = script.getAttribute("data-portfolio-id");
  if (!portfolioId) return;

  // Derive the app origin from the script src.
  var src = script.getAttribute("src") || "";
  var origin;
  try {
    origin = new URL(src, window.location.href).origin;
  } catch (e) {
    return;
  }

  // Don't mount twice on the same page.
  if (document.getElementById("portfolio-chatbot-iframe")) return;

  var CLOSED_SIZE = { w: 72, h: 72 }; // some room around the 56×56 launcher
  var OPEN_SIZE = { w: 400, h: 600 };

  var iframe = document.createElement("iframe");
  iframe.id = "portfolio-chatbot-iframe";
  iframe.title = "Portfolio chatbot";
  iframe.src = origin + "/embed/chatbot/" + encodeURIComponent(portfolioId);
  iframe.allow = "";
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = [
    "position:fixed",
    "bottom:16px",
    "right:16px",
    "width:" + CLOSED_SIZE.w + "px",
    "height:" + CLOSED_SIZE.h + "px",
    "border:0",
    "background:transparent",
    "color-scheme:light",
    "z-index:2147483646", // just below the max; leaves room for dev tools
    "transition:width 180ms ease, height 180ms ease",
    "box-shadow:none",
    "pointer-events:auto",
  ].join(";");

  // Some host CSS reset `iframe { max-width: 100%; }` which breaks the
  // fixed-size assumption on small devices. Enforce explicit sizing.
  iframe.setAttribute("scrolling", "no");

  function mount() {
    if (document.body) {
      document.body.appendChild(iframe);
    } else {
      document.addEventListener("DOMContentLoaded", function once() {
        document.removeEventListener("DOMContentLoaded", once);
        if (document.body) document.body.appendChild(iframe);
      });
    }
  }
  mount();

  // Remove the widget silently on iframe load failure (e.g. app down,
  // CORS blocked by strict CSP). Don't spam the host page's console.
  iframe.addEventListener("error", function () {
    try {
      iframe.parentNode && iframe.parentNode.removeChild(iframe);
    } catch (e) {}
  });

  function applySize(open) {
    var target = open ? OPEN_SIZE : CLOSED_SIZE;
    iframe.style.width = target.w + "px";
    iframe.style.height = target.h + "px";
    // Mobile: if viewport too small, go full-bleed when open.
    if (open && window.innerWidth < 480) {
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.bottom = "0";
      iframe.style.right = "0";
    } else {
      iframe.style.bottom = "16px";
      iframe.style.right = "16px";
    }
  }

  window.addEventListener("message", function (event) {
    // Accept messages only from our own origin.
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "chatbot-resize") {
      applySize(Boolean(data.open));
    }
  });
})();
