/**
 * Kinetic template — progressive enhancement bootstrap.
 *
 * Bundle (≤5 KB before adding video; ≤5 KB target overall):
 *   1. §2.12 Theme toggle wiring (data-kinetic-theme-toggle)
 *   2. §2.9  Magnetic hover on [data-magnet] cards
 *   3. §2.3  BlurText IO observer for below-the-fold instances
 *   4. §2.4  rAF video fade loop (only when basics.heroVideoUrl set)
 *   5. §2.5  HLS bootstrap (Safari-native first, then hls.js UMD fallback)
 *
 * Each block is self-contained — a missing element / unsupported API
 * silently no-ops without short-circuiting the rest of the bundle.
 */
(function () {
  "use strict";

  var reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── §2.12 Theme toggle ──────────────────────────────────────────── */
  (function () {
    var toggleBtn = document.querySelector("[data-kinetic-theme-toggle]");
    if (!toggleBtn) return;
    toggleBtn.addEventListener("click", function () {
      var html = document.documentElement;
      var next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
      html.setAttribute("data-theme", next);
      try {
        localStorage.setItem("kinetic-theme", next);
      } catch (_) {
        /* private mode / sandboxed iframe — silently ignore */
      }
    });
  })();

  /* ── §2.9 Magnetic hover ─────────────────────────────────────────── */
  if (!reducedMotion) {
    var magnets = document.querySelectorAll("[data-magnet]");
    magnets.forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.12;
        var y = (e.clientY - r.top - r.height / 2) * 0.12;
        el.style.transform = "translate(" + x + "px, " + y + "px)";
      });
      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
      });
    });
  }

  /* ── §2.3 BlurText IO observer (below-the-fold gating) ───────────── */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var gated = document.querySelectorAll(".blur-text-gated");
    if (gated.length === 0) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("blur-text--visible");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 }
    );
    gated.forEach(function (el) {
      io.observe(el);
    });
  })();

  /* ── §2.4 / §2.5 Hero video bootstrap + fade loop ───────────────── */
  (function () {
    var v = document.querySelector('[data-video="hero"]');
    if (!v) return;

    /* §2.5 HLS bootstrap */
    var hlsSrc = v.getAttribute("data-hls-src");
    if (hlsSrc) {
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = hlsSrc;
      } else if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls();
        hls.loadSource(hlsSrc);
        hls.attachMedia(v);
      }
      // No-op when neither path available — the .hero-backdrop CSS
      // gradient remains visible behind the empty <video>.
    }
    // For .mp4 sources the <source> child is in the markup already.

    /* prefers-reduced-motion: paint first frame, then pause. CSS keeps
       opacity at 1 so the still frame is always visible. */
    if (reducedMotion) {
      v.addEventListener(
        "loadeddata",
        function () {
          v.pause();
        },
        { once: true }
      );
      return;
    }

    /* §2.4 rAF fade loop */
    v.style.opacity = "0";
    var raf = 0;
    var fadingOut = false;

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
      })();
    }

    v.addEventListener(
      "loadeddata",
      function () {
        v.style.opacity = "0";
        v.play().catch(function () {
          // Autoplay blocked — fall through with opacity 1 so the still
          // frame is at least visible.
          v.style.opacity = "1";
        });
        fadeTo(1);
      },
      { once: true }
    );

    v.addEventListener("timeupdate", function () {
      if (fadingOut) return;
      var remaining = v.duration - v.currentTime;
      if (remaining > 0 && remaining <= 0.55) {
        fadingOut = true;
        fadeTo(0);
      }
    });

    v.addEventListener("ended", function () {
      v.style.opacity = "0";
      setTimeout(function () {
        v.currentTime = 0;
        fadingOut = false;
        v.play().catch(function () {});
        fadeTo(1);
      }, 100);
    });
  })();
})();
