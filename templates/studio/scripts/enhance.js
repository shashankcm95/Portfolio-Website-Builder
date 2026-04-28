/**
 * Studio template — progressive enhancement bootstrap.
 *
 * §2.4  rAF video fade loop on [data-video="hero"].
 * §2.5  HLS bootstrap (Safari-native first, then hls.js UMD fallback).
 *
 * Constraints:
 *   - IIFE, no dependencies, ≤5 KB minified.
 *   - Honours prefers-reduced-motion: shows a still first-frame instead of
 *     autoplaying; the rAF fade loop does not run.
 *   - NO autoplay or loop attributes on the <video> element — this script
 *     owns both concerns at runtime.
 *   - Exits immediately (no-op) when [data-video="hero"] is absent, so
 *     static-hero pages pay zero cost.
 */
(function () {
  /* ── Guard: no video element → nothing to do ───────────────────── */
  var v = document.querySelector('[data-video="hero"]');
  if (!v) return;

  /* ── §2.5 HLS bootstrap ─────────────────────────────────────────── */
  var hlsSrc = v.getAttribute("data-hls-src");
  if (hlsSrc) {
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari — native HLS support; set src directly.
      v.src = hlsSrc;
    } else if (window.Hls && window.Hls.isSupported()) {
      // Chromium / Firefox — use the vendored hls.js UMD build.
      var hls = new window.Hls();
      hls.loadSource(hlsSrc);
      hls.attachMedia(v);
    }
    // If neither path is available (very old browser, no hls.js loaded),
    // the video element stays empty and the .studio-hero--video section
    // falls back to its dark-background CSS — still readable.
  }
  // For .mp4 sources the <source> child is already in the markup; no
  // additional src wiring needed here.

  /* ── prefers-reduced-motion: show still first frame, then stop ─── */
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    // Load enough data to paint the first frame, then immediately pause.
    // The CSS rule `.studio-hero__video { opacity: 1 !important; }` ensures
    // the still frame is always visible.
    v.addEventListener("loadeddata", function () {
      v.pause();
    }, { once: true });
    return; // Do not attach the fade-loop handlers below.
  }

  /* ── §2.4 rAF fade loop ─────────────────────────────────────────── */
  // Start opacity at 0 so the initial load fades in smoothly.
  v.style.opacity = "0";

  var raf = 0;
  var fadingOut = false;

  /**
   * Animate opacity toward `target` using a proportional easing step.
   * Reads the live v.style.opacity so re-entry after a loop restart is
   * always smooth regardless of where the previous fade stopped.
   */
  function fadeTo(target) {
    cancelAnimationFrame(raf);
    (function tick() {
      var cur = parseFloat(v.style.opacity || "0");
      var delta = (target - cur) * 0.08; // ~12-frame ease
      var next = Math.abs(delta) < 0.005 ? target : cur + delta;
      v.style.opacity = String(next);
      if (next !== target) {
        raf = requestAnimationFrame(tick);
      }
    }());
  }

  // First frame ready → fade in from 0 to 1, then begin playback.
  v.addEventListener("loadeddata", function () {
    v.style.opacity = "0";
    v.play().catch(function () {
      // Autoplay blocked (e.g. no user gesture yet on some browsers).
      // Leave video paused at first frame; opacity set to 1 by CSS
      // fallback so content area is still visible.
      v.style.opacity = "1";
    });
    fadeTo(1);
  }, { once: true });

  // Near-end detection: begin fade-out in the last 0.55 s of the clip.
  v.addEventListener("timeupdate", function () {
    if (fadingOut) return;
    var remaining = v.duration - v.currentTime;
    if (remaining > 0 && remaining <= 0.55) {
      fadingOut = true;
      fadeTo(0);
    }
  });

  // Clip ended: wait one tick, reset, play again, fade back in.
  // `loop` attribute is NOT on the <video> element — this handler owns
  // the loop so the fade transition fires every cycle without a hard cut.
  v.addEventListener("ended", function () {
    v.style.opacity = "0";
    setTimeout(function () {
      v.currentTime = 0;
      fadingOut = false;
      v.play().catch(function () {});
      fadeTo(1);
    }, 100);
  });
}());
