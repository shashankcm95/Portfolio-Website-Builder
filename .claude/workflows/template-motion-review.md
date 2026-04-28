# Template motion review — pre-merge checklist

Use this workflow whenever a PR or branch touches `templates/<name>/`
files (CSS, components, scripts) **or** when adding a new template. It's
the human-readable companion to the `/review-template-motion` slash
command — both produce the same output, but the slash command does it
through the `motion-ui-engineer` subagent in an isolated context.

## When to invoke

| Trigger | Use the agent? |
|---|---|
| New CSS keyframe added to a template | **yes** |
| New `[data-…]` attribute or new `scripts/*.js` file | **yes** |
| Hero / project-card / nav restructure | **yes** |
| Color / contrast token change | **yes** |
| Pure copy / data-flow change in a `*.tsx` page | no |
| Bumping a fixture in a test | no |

When unsure, run it. The cost is ~$0.05 of agent time and ~3 minutes wall-clock.

## What the review covers

The agent reads `docs/motion-patterns.md` and the diff, then produces
a report with these gates. Every "yes" is required to merge.

### 1. Motion budget
- [ ] Per-template JS bootstrap (`templates/<name>/scripts/*.js`) is
  ≤ 5 KB minified.
- [ ] No new npm dependencies introduced for motion. (Re-uses
  Google Fonts / vanilla DOM APIs / CSS-only.)

### 2. Reduced motion (HARD)
- [ ] Every new `@keyframes` has a matching `@media (prefers-reduced-motion: reduce)` no-op
  that sets `animation: none; opacity: 1` (and resets `filter` / `transform`
  if the keyframe used them).
- [ ] No `animation: …` rule fires unconditionally without an opt-out path.
- [ ] CSS `scroll-behavior: smooth` is gated by reduced-motion.

### 3. Accessibility (HARD)
- [ ] `tests/unit/templates/a11y-axe.test.tsx` passes for both the
  changed template's home + about pages.
- [ ] All new color pairs (text on background, especially over animated
  gradients / glass) clear WCAG AA 4.5:1. The §2.14 caveat applies:
  bright accents need a darker text variant.
- [ ] No content hidden behind hover-only states on touch devices.
- [ ] No new `position: fixed` element that intercepts iOS keyboard pop-up.

### 4. Static SSR (HARD)
- [ ] No `useState` / `useEffect` / `useRef` in components that render
  inside `Layout`. (Hooks won't run — this is `renderToStaticMarkup`.)
- [ ] Any new motion-driving JS lives in a vanilla-IIFE
  `templates/<name>/scripts/*.js` and is inlined via `fs.readFileSync`
  at SSR module-load (signal / kinetic pattern).
- [ ] No new framework runtime (Framer Motion / GSAP / Lottie / Lenis)
  added to the published bundle.

### 5. Pattern-library reuse
- [ ] Every primitive used cites a §-number from `docs/motion-patterns.md`
  in a comment. (E.g. `/* §2.2 BlurFadeUp */`.)
- [ ] Any new primitive that doesn't exist yet is described in the
  PR / report so it can be back-ported to `docs/motion-patterns.md`
  in a separate commit.

### 6. Test gates
- [ ] `npm test -- a11y-axe` passes.
- [ ] `npm test -- snapshots` passes — or the snapshot diff is
  intentional, reviewed, and `-u` was run.
- [ ] `npm test` (full suite) passes — count is unchanged or
  increased only by the new template's added cases.
- [ ] `npx tsc --noEmit` is clean.

## How the agent reports back

The agent's response will follow this structure:

```
## Pass | Concerns | Blockers

(none | one-line list per category)

## Files reviewed
…

## Gate results
1. Motion budget: pass / concern / blocker (+ one line)
…

## Recommendations
…

## New primitives discovered
(none | description for back-port to motion-patterns.md)
```

## Direct invocation (without the slash command)

If you don't want to use `/review-template-motion`, dispatch the agent
manually with:

```
Agent({
  subagent_type: "motion-ui-engineer",
  description: "Review template motion changes",
  prompt: "Review the motion changes on branch <branchname>. Read docs/motion-patterns.md, then run `git diff main...HEAD --stat` and inspect every file in templates/. Apply the gates from .claude/workflows/template-motion-review.md and report back in the structured format that document specifies. Run npm test -- a11y-axe and npx tsc --noEmit yourself. Do not modify files."
})
```
