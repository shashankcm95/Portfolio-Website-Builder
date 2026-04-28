# Motion-UI Pattern Library

Distilled from a corpus of ~30 dynamic-website reference templates (motionsites.ai
free prompts: Velorah, Aethera, Prisma, Asme, Stellar.ai, Orbis.Nft, VEX, SkyElite,
CodeNest, DesignPro, Viktor Oddy / Vortex Studio, Mindloop, securify, plus several
unnamed cinematic-streaming, SaaS, NFT, jet-charter and product-design heroes).

This file is the **single source of motion truth** for this codebase. The
`motion-ui-engineer` subagent (`.claude/agents/motion-ui-engineer.md`) consults it
when proposing or building dynamic templates. Authors of new templates should
prefer reusing primitives from this file over inventing new ones.

---

## 0. Hard architectural constraint

Templates in this repo render to **static HTML** via `renderToStaticMarkup`
(see `src/lib/generator/renderer.ts`). The deployed site:

- Has **no client-side React framework** at runtime.
- May load **tiny vanilla-JS bootstraps** (the same pattern used by
  `public/chat-embed/chat.js` and the Mermaid bootstrap) — a single ESM/IIFE
  file inlined or co-deployed.
- Must honor `prefers-reduced-motion`.
- Must remain WCAG 2.1 AA compliant — the `tests/unit/templates/a11y-axe.test.tsx`
  CI guard rejects any contrast / heading / ARIA regression at PR time.

**Therefore:** every Framer-Motion idiom in the reference corpus must be
translated to one of:

| Source idiom | Target in this repo |
|---|---|
| `<motion.div initial / animate />` | CSS `@keyframes` + `animation-delay` (per-element style) |
| Stagger via Framer | `nth-child` selectors or inline `style="--i: 3"` token |
| `useInView` / IntersectionObserver | `IntersectionObserver` in a 1–3 KB enhance.js |
| `useScroll` + transforms | CSS `scroll-timeline` + `view-timeline` (with reduced-motion fallback) |
| `motion.span` per-word | Pre-split into `<span>` at SSR time, animate with CSS |
| Hooks reading `useRef` to a video | Vanilla JS attaching to `[data-video="hero"]` |

Templates **never** depend on hydration. Animation must run from inert DOM the
moment the `<style>` block parses.

---

## 1. Visual systems observed in the corpus

### 1.1 Color systems

| System | When to use | Example tokens |
|---|---|---|
| **Cinematic dark** (Velorah, Orbis.Nft, securify, Mindloop, CodeNest, VEX, Prisma) | Hero with looping video, premium / agency / NFT / SaaS, italic-serif accents | `--bg: 0 0% 0%` or `260 87% 3%`; `--fg: 40 6% 95%`; `--muted: 0 0% 60%` |
| **Warm cream cinematic** (Prisma) | Boutique creative studio, dark base + warm accent | `--bg: 25 12% 7%`; `--accent: 32 64% 78%` (peach cream); body Almarai |
| **Light editorial** (Stellar.ai, Viktor Oddy, SkyElite, Asme, DesignPro) | AI / consultancy / freelance / education with whitespace + serif accent | `--bg: #fff` or `#f8f7f4`; `--fg: #0b0b0d`; one warm brand accent |
| **Pure mono** (Mindloop) | Newsletter / minimalist: nothing but `#000` and `#fff`, italic-serif accent words | `bg-black text-white`; only Inter + Instrument Serif |
| **Brand-pop dark** (CodeNest cyan, securify green) | Single-accent SaaS hero | `bg-[#0a0a0f]`; one HSL accent for buttons + glow |

CSS variables live in `:root` and `[data-theme="dark"]`. Use `hsl(var(--…))`
syntax so Tailwind utilities like `text-foreground` resolve correctly.

### 1.2 Typography pairings

The corpus converges on a **small** set:

| Heading | Body / nav | Mood |
|---|---|---|
| **Instrument Serif** (italic) | Inter / Geist Sans | Cinematic, editorial — by far the most common pairing |
| **Anton** (condensed sans) | Anton + Inter | NFT / space (Orbis.Nft) |
| **PP Mondwest** (display serif) | PP Neue Montreal | Boutique design studios (Viktor Oddy) — needs licensing |
| **Almarai** | Almarai + Instrument Serif | Warm / Mediterranean (Prisma) |
| **Readex Pro** | Readex Pro | Tight technical SaaS (securify) |
| **Geist Sans** + **IBM Plex Mono** | same | Code-focused (CodeNest, dev tooling) |

**Always prefer Google Fonts** (free, self-hostable) over Webflow CDN or
proprietary foundries. PP Mondwest / PP Neue Montreal require a paid license
and are listed only for reference.

### 1.3 Hero composition recipes

Five recurring layouts:

1. **Fullscreen video + glass nav + bottom-left content**
   (Aethera, Velorah, securify, generic cinematic).
   Video at `inset-0 object-cover z-0`; navbar `z-50`; content in a
   `flex flex-col justify-end px-8 py-16 z-10`.
2. **Fullscreen video + centered hero**
   (CodeNest, DesignPro, SkyElite). Same z-stack, content centered.
3. **Fullscreen video + bottom partners marquee**
   (segment 1 of corpus). Adds a `mt-auto` partners row over the video.
4. **Pinned left rail + scrolling right column**
   (already present in this repo's `signal` template — corpus reinforces it).
5. **Hero with no video, oversized italic headline**
   (Mindloop, Viktor Oddy "Grow" 230px). Pure-type composition, dependent on
   `clamp()` typography and tight `letter-spacing: -0.024em`.

---

## 2. Reusable primitives (drop-in for static SSR)

### 2.1 Liquid-glass utility

The single most reused effect across the corpus. It appears on navbars, pills,
cards, buttons, search inputs.

```css
/* liquid-glass — subtle (over video / dark backgrounds) */
.liquid-glass {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
}
.liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0)    40%,
    rgba(255, 255, 255, 0)    60%,
    rgba(255, 255, 255, 0.15) 80%,
    rgba(255, 255, 255, 0.45) 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
}

/* liquid-glass-strong — for primary CTAs */
.liquid-glass-strong {
  background: rgba(255, 255, 255, 0.08);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.18),
    0 8px 24px -8px rgba(0, 0, 0, 0.4);
}
.liquid-glass-strong::before { /* same gradient stroke */ }
```

The `mask-composite: xor / exclude` pair is what produces the **gradient
border-only stroke** (no fill bleed). Without it the gradient fills the whole
element.

### 2.2 BlurFadeUp keyframe

```css
@keyframes blurFadeUp {
  from { opacity: 0; filter: blur(20px); transform: translateY(40px); }
  to   { opacity: 1; filter: blur(0);    transform: translateY(0); }
}
.animate-blur-fade-up {
  animation: blurFadeUp 1s ease-out forwards;
  opacity: 0; /* initial state — JS not required */
}

/* Stagger via inline `style="--d:300ms"` token */
.animate-blur-fade-up { animation-delay: var(--d, 0ms); }

@media (prefers-reduced-motion: reduce) {
  .animate-blur-fade-up { animation: none; opacity: 1; }
}
```

SSR usage: `<h1 class="animate-blur-fade-up" style="--d:200ms">…</h1>`. No JS.

### 2.3 BlurText (per-word reveal)

The corpus uses Framer Motion + IntersectionObserver. Static-SSR adaptation:

- **At render time**, split the headline into `<span class="word">` elements
  inside a `<span class="blur-text">` wrapper. Each word gets `style="--i: N"`.
- A `@keyframes` runs each word with `animation-delay: calc(var(--i) * 90ms)`.
- For below-the-fold instances, gate via a 1 KB IntersectionObserver script
  that toggles a class on the wrapper.

```html
<h1 class="blur-text" data-blur-text>
  <span class="word" style="--i:0">The</span>
  <span class="word" style="--i:1">Website</span>
  <span class="word" style="--i:2">Your</span>
  …
</h1>
```

```css
.blur-text .word {
  display: inline-block;
  opacity: 0;
  filter: blur(10px);
  transform: translateY(50px);
  animation: blurInWord 0.8s cubic-bezier(.2,.7,.2,1) forwards;
  animation-delay: calc(var(--i) * 90ms + 200ms);
}
@keyframes blurInWord {
  50%  { opacity: 0.5; filter: blur(5px); transform: translateY(-5px); }
  100% { opacity: 1;   filter: blur(0);   transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .blur-text .word { animation: none; opacity: 1; filter: none; transform: none; }
}
```

### 2.4 Custom video fade loop (rAF)

Patterns that ship a manual fade-out before `loop` re-fires (so the cut isn't
jarring) need vanilla JS. Drop this at the bottom of the page or load it as
`scripts/enhance.js`:

```js
// Fade-aware looping video. Reads current opacity so re-entry is smooth.
(() => {
  const v = document.querySelector('[data-video="hero"]');
  if (!v) return;
  let raf = 0, fadingOut = false;
  const fadeTo = (target) => {
    cancelAnimationFrame(raf);
    const tick = () => {
      const cur = parseFloat(v.style.opacity || '1');
      const delta = (target - cur) * 0.08; // ~12 frame fade
      const next = Math.abs(delta) < 0.005 ? target : cur + delta;
      v.style.opacity = String(next);
      if (next !== target) raf = requestAnimationFrame(tick);
    };
    tick();
  };
  v.addEventListener('loadeddata', () => { v.style.opacity = '0'; v.play(); fadeTo(1); });
  v.addEventListener('timeupdate', () => {
    if (fadingOut) return;
    if (v.duration - v.currentTime <= 0.55 && v.duration - v.currentTime > 0) {
      fadingOut = true;
      fadeTo(0);
    }
  });
  v.addEventListener('ended', () => {
    v.style.opacity = '0';
    setTimeout(() => { v.currentTime = 0; v.play(); fadingOut = false; fadeTo(1); }, 100);
  });
  // Loop attribute MUST be off on the <video> tag.
})();
```

Honor `matchMedia('(prefers-reduced-motion: reduce)').matches` — bail out and
just `pause()` the video.

### 2.5 HLS streaming bootstrap

When the source is `.m3u8` rather than `.mp4` (CodeNest, segment-1 partners
section), Safari plays natively but Chromium needs `hls.js`. Self-host the
~32 KB UMD build alongside the template.

```html
<video data-video="hero" data-hls-src="https://stream.mux.com/…m3u8"
       autoplay muted playsinline></video>
<script src="/templates/<name>/scripts/hls.min.js"></script>
<script>
  (() => {
    const v = document.querySelector('[data-video="hero"]');
    const src = v?.dataset.hlsSrc;
    if (!v || !src) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
    } else if (window.Hls?.isSupported()) {
      const hls = new window.Hls(); hls.loadSource(src); hls.attachMedia(v);
    }
  })();
</script>
```

### 2.6 Floating-pill navbar

Used by securify, Aethera, Velorah, Asme, Stellar.ai. The pattern:

```html
<nav class="fixed top-4 left-1/2 -translate-x-1/2 z-50 liquid-glass rounded-full
            px-1.5 py-1.5 flex items-center gap-1">
  <a class="px-3 py-2 text-sm font-medium text-white/90 hover:text-white">Home</a>
  …
  <button class="ml-2 px-4 py-2 rounded-full bg-white text-black text-sm">
    Claim a Spot <svg>↗</svg>
  </button>
</nav>
```

On mobile (`<md`): collapse links into a hamburger, keep the CTA visible.

### 2.7 Logo / partners marquee

Continuous horizontal scroll using only CSS:

```css
.marquee { display: flex; overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.marquee__track { display: flex; gap: 4rem; animation: marquee 28s linear infinite; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .marquee__track { animation: none; } }
```

Render the partner list **twice** in the same track so the wrap is seamless.

### 2.8 Italic-serif accent words

The `Mindloop`, `Velorah`, `Prisma` and Brittany-Chiang-style hero treatment:

```html
<h1>The website your brand <em>deserves</em></h1>
```

```css
h1 em { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; letter-spacing: -0.02em; color: var(--accent); }
```

### 2.9 Magnetic hover (cards)

Vanilla JS, ~1.5 KB, progressive:

```js
(() => {
  const els = document.querySelectorAll('[data-magnet]');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  els.forEach(el => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width  / 2) * 0.15;
      const y = (e.clientY - r.top  - r.height / 2) * 0.15;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
})();
```

### 2.10 Scroll-driven word opacity (per-line)

CSS scroll-timeline (Chromium / Firefox; Safari graceful-degrades to no
animation, which still reads):

```css
.scroll-reveal { animation: scrollReveal linear; animation-timeline: view(); animation-range: entry 10% cover 40%; }
@keyframes scrollReveal { from { opacity: 0.2; } to { opacity: 1; } }
@supports not (animation-timeline: view()) {
  .scroll-reveal { opacity: 1; } /* Safari fallback */
}
```

### 2.11 Role/word cycling (Michael Smith pattern)

A line that swaps a word every 2 s. 100% CSS:

```html
<p>A <span class="role-rot"><b>Creative</b><b>Fullstack</b><b>Founder</b><b>Scholar</b></span> lives in Chicago.</p>
```

```css
.role-rot { display: inline-grid; grid-template-areas: "a"; }
.role-rot > b { grid-area: a; opacity: 0; animation: roleRot 8s infinite; font-style: italic; }
.role-rot > b:nth-child(1) { animation-delay: 0s; }
.role-rot > b:nth-child(2) { animation-delay: 2s; }
.role-rot > b:nth-child(3) { animation-delay: 4s; }
.role-rot > b:nth-child(4) { animation-delay: 6s; }
@keyframes roleRot { 0%,20% { opacity: 1; transform: translateY(0); } 25%,100% { opacity: 0; transform: translateY(-6px); } }
```

### 2.12 Theme toggle (1 KB)

```html
<script>
  // Inline before <body> close — no FOUC
  (() => {
    const k = 'theme';
    const saved = localStorage.getItem(k) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = saved;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-theme-toggle]')) return;
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem(k, next);
    });
  })();
</script>
```

Pair with `:root[data-theme="dark"] { … }` in the template's CSS.

---

## 3. Per-template motif index

Use this table when proposing a *new* template — pick a personality, then
borrow the column's primitives.

| Reference | Mood | Hero | Nav | Distinctive primitive |
|---|---|---|---|---|
| **Velorah** | Cinematic agency | Video + bottom partners marquee | Floating glass pill | Instrument-Serif italic + BlurText word reveal |
| **Aethera** | Space/launch | Video, glass top-bar, italic CTA | Glass pill | "Begin Journey" CTA, Star/Innovation cards |
| **Prisma** | Warm cinematic studio | Dark + cream, Almarai body | Sticky top with menu | Hero → About → Features stagger |
| **Asme** | Dark education | Centered hero, globe icon | Glass pill | Email-capture + soft glow |
| **Stellar.ai** | Light AI | White bg, ShinyText | Pill | ShinyText shimmer (pure CSS gradient sweep) |
| **Orbis.Nft** | Dark space NFT | Anton condensed display | Glass pill | NFT card grid with HLS bg |
| **VEX** | Dark venture | Big mono headline | Pill, "Start a Chat" white CTA | Three-pillar list (Story/Investing/Building/Advisory) |
| **SkyElite** | Light aviation | Premium light hero, video | Underlined link nav | Reservation form |
| **CodeNest** | Dark dev edu | HLS stream bg | Glass nav | Code-syntax accent in hero |
| **DesignPro** | Light design edu | Video, peach accent | Light pill | Course-card row |
| **Viktor Oddy / Vortex** | Light boutique | "Grow" 230 px headline | Side rail + minimal | Apple/Polygon client wall |
| **Mindloop** | Pure mono newsletter | Italic-serif accent words | Plain text nav | Email capture w/ blurFadeUp |
| **securify** | Dark SaaS | Big stagger headline + green accent | Floating glass pill | Pre-headline label "Cybersecurity" |
| **Michael Smith** | Personal portfolio | "{role} lives in Chicago" cycler | Sidebar nav | Role-cycle CSS animation |
| **Generic cinematic streaming** | Dark streaming | Video + center-screen H1 | Search + profile glass pills | rAF fade-in/out on loop |

When the user says "make it like X" pick the row, lift the column primitives,
and translate to static SSR per Section 0.

---

## 4. Translation cheatsheet (Framer Motion → static)

| Framer Motion | Static-SSR equivalent |
|---|---|
| `<motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.3}}>` | `<div class="fade-in" style="--d:300ms">` + `@keyframes fade-in` |
| `whileHover={{scale: 1.02}}` | `:hover { transform: scale(1.02); transition: transform .2s }` |
| `useInView` triggering animation | `IntersectionObserver` toggling `.is-visible` class |
| `useScroll` / `useTransform` | `animation-timeline: view()` (fallback: opacity 1) |
| Stagger via `transition={{staggerChildren: .08}}` | Pre-compute index, set `style="--i:N"`, multiply in keyframe delay |
| `<AnimatePresence>` page transitions | View Transitions API (`@view-transition`) — Chromium only, cosmetic only |

---

## 5. Accessibility & performance budget

Every template the agent produces must:

1. Pass `tests/unit/templates/a11y-axe.test.tsx` with **zero** violations on
   home + about. Color contrast vs the inlined CSS, headings in order, ARIA
   landmark per region.
2. Lighthouse **Performance ≥ 95**, **A11y = 100**, **Best Practices = 100**.
3. Keep the per-template JS bootstrap **under 5 KB minified** (excluding
   `hls.min.js` which is shared).
4. Honor `prefers-reduced-motion` — every keyframe must have a reduced-motion
   no-op.
5. Avoid `position: fixed` for elements that hide content on iOS Safari
   keyboard popup.
6. Never load Webflow / proprietary CDN fonts. Only Google Fonts (or
   self-hosted woff2).

---

## 6. When in doubt

- Prefer **CSS-only**; reach for vanilla JS only when CSS can't express it.
- Prefer **one CSS variable** as the stagger token (`--i`, `--d`) over
  selector-explosion (`nth-child(1)..(20)`).
- Prefer **system font fallbacks first** so the page is readable before the
  webfont arrives.
- Prefer `clamp(min, fluid, max)` over media-query typography ladders.
- Never hide content behind hover-only on touch devices.
