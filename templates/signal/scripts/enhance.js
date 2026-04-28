/**
 * Signal template — progressive enhancement bootstrap.
 *
 * §2.9  Magnetic hover on [data-magnet] project cards.
 * §nav  Scroll-driven active nav: IntersectionObserver watches each
 *       <section id="…"> and toggles .is-active on the matching
 *       [href="#id"] rail nav link.
 *
 * Constraints:
 *   - IIFE, no dependencies, ≤5 KB minified.
 *   - Fully honours prefers-reduced-motion (magnetic skipped; IO still runs
 *     because toggling a class is not an animation).
 *   - Does not touch currentPage-based .active class — coexists.
 */
(function () {
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
  if (!("IntersectionObserver" in window)) return;

  // Collect all <section id="…"> elements in the main content column.
  var sections = Array.prototype.slice.call(
    document.querySelectorAll("main section[id]")
  );
  if (sections.length === 0) return;

  // Build a map: sectionId → nav anchor element.
  // Nav links are [href="#id"] inside .rail-nav. We also accept
  // plain href="/path/#id" patterns so the home anchor stat pill
  // doesn't break anything.
  var navLinks = document.querySelectorAll(".rail-nav a[href]");
  var linkMap = {};
  navLinks.forEach(function (a) {
    var href = a.getAttribute("href") || "";
    // Match both "#work" and "/#work" shapes.
    var match = href.match(/#([^/]+)$/);
    if (match) {
      linkMap[match[1]] = a;
    }
  });

  var activeId = null;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id;
        if (entry.isIntersecting) {
          // Section entered viewport — mark it active.
          if (activeId && linkMap[activeId]) {
            linkMap[activeId].classList.remove("is-active");
          }
          activeId = id;
          if (linkMap[id]) {
            linkMap[id].classList.add("is-active");
          }
        }
      });
    },
    {
      // Trigger when section crosses the middle third of the viewport.
      rootMargin: "-30% 0px -60% 0px",
      threshold: 0,
    }
  );

  sections.forEach(function (section) {
    observer.observe(section);
  });
})();
