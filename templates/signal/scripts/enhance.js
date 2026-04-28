/**
 * Signal template — progressive enhancement bootstrap.
 *
 * Each block is a self-contained IIFE so a missing element / unsupported
 * API silently no-ops without short-circuiting the rest of the bundle.
 *
 *   §2.9   Magnetic hover on [data-magnet] project cards.
 *   §nav   Scroll-driven active nav (IntersectionObserver toggles
 *          .is-active on matching .rail-nav anchors).
 *   §2.4   rAF video fade loop (only when basics.heroVideoUrl set).
 *   §2.5   HLS bootstrap (Safari-native first, then hls.js UMD fallback).
 *
 * Constraints:
 *   - IIFE, no dependencies, ≤5 KB minified.
 *   - Fully honours prefers-reduced-motion.
 *   - Does not touch currentPage-based .active class — coexists.
 */
(function () {
  "use strict";
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── §2.9 Magnetic hover ──────────────────────────────────────── */
  if (!reducedMotion) {
    var magnets = document.querySelectorAll("[data-magnet]");
    magnets.forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.15;
        var y = (e.clientY - r.top - r.height / 2) * 0.15;
        el.style.transform = "translate(" + x + "px, " + y + "px)";
      });
      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
      });
    });
  }

  /* ── Scroll-driven active nav ─────────────────────────────────── */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var sections = Array.prototype.slice.call(
      document.querySelectorAll("main section[id]")
    );
    if (sections.length === 0) return;
    var navLinks = document.querySelectorAll(".rail-nav a[href]");
    var linkMap = {};
    navLinks.forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var match = href.match(/#([^/]+)$/);
      if (match) linkMap[match[1]] = a;
    });
    var activeId = null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.id;
          if (entry.isIntersecting) {
            if (activeId && linkMap[activeId]) {
              linkMap[activeId].classList.remove("is-active");
            }
            activeId = id;
            if (linkMap[id]) linkMap[id].classList.add("is-active");
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    sections.forEach(function (section) {
      observer.observe(section);
    });
  })();

  /* ── §2.4 / §2.5 Hero video bootstrap + fade loop ─────────────── */
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
    }

    /* prefers-reduced-motion: still first frame, no autoplay loop */
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
        var delta = (target - cur) * 0.08;
        var next = Math.abs(delta) < 0.005 ? target : cur + delta;
        v.style.opacity = String(next);
        if (next !== target) raf = requestAnimationFrame(tick);
      })();
    }
    v.addEventListener(
      "loadeddata",
      function () {
        v.style.opacity = "0";
        v.play().catch(function () {
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
