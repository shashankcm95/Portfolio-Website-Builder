/**
 * Kinetic template — progressive enhancement bootstrap.
 *
 * Bundle (≤5 KB):
 *   1. §2.12 Theme toggle wiring (data-kinetic-theme-toggle)
 *   2. §2.9  Magnetic hover on [data-magnet] cards
 *   3. §2.3  BlurText IO observer for below-the-fold instances
 *
 * Above-the-fold .blur-text instances animate from CSS on parse — no JS
 * gating needed. The IO observer is for any instance with .blur-text-gated
 * which means "wait until in view".
 *
 * All motion respects prefers-reduced-motion.
 */
(function () {
  "use strict";

  var reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── §2.12 Theme toggle ──────────────────────────────────────────── */
  var toggleBtn = document.querySelector("[data-kinetic-theme-toggle]");
  if (toggleBtn) {
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
  }

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
  if (!("IntersectionObserver" in window)) return;

  var gated = document.querySelectorAll(".blur-text-gated");
  if (gated.length === 0) return;

  // Words inside a gated .blur-text start with animation-play-state:paused
  // (set inline via the markup) and toggle to running when the wrapper
  // enters the viewport.
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("blur-text--visible");
        io.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -10% 0px",
      threshold: 0,
    }
  );
  gated.forEach(function (el) {
    io.observe(el);
  });
})();
