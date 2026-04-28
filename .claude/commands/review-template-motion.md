---
name: review-template-motion
description: Pre-merge motion / a11y / motion-budget review for any template change. Spawns the motion-ui-engineer subagent with full grounding so it can read docs/motion-patterns.md, diff the working tree, run the test gates, and produce a structured pass/concerns/blockers report.
argument-hint: [branch-or-commit-range]
disable-model-invocation: true
---

You are about to review template motion / a11y changes on this branch.

Spawn the `motion-ui-engineer` subagent in foreground (we need its
report before deciding to merge) with the prompt below. Pass the
target branch / commit range from `$ARGUMENTS` if the user specified
one; otherwise diff against `main`.

```
Working directory: /Users/shashankchandrashekarmurigappa/Documents/portfolio-website-builder

You are reviewing template motion changes for pre-merge approval.

## Step 1 — read the source of truth

Read these files in order:
1. docs/motion-patterns.md (the pattern library — every primitive cites a §-number here)
2. .claude/workflows/template-motion-review.md (the gate checklist you must apply)

## Step 2 — discover the diff

Run (in this order, capture the output):
- `git status --short`
- `git diff main...HEAD --stat -- templates/`  (or use $ARGUMENTS as the base ref if provided)
- `git diff main...HEAD -- templates/<name>/styles/global.css` for each template that has changes

If there are NO changes under templates/ on this branch, stop and report "no template motion changes to review."

## Step 3 — apply the six gates

Apply each gate from .claude/workflows/template-motion-review.md sections 1-6:
1. Motion budget (≤5 KB JS, no new deps)
2. Reduced motion (every @keyframes has a no-op fallback)
3. Accessibility (axe-clean, contrast verified)
4. Static SSR (no hooks, vanilla JS only, no runtime framework)
5. Pattern-library reuse (every primitive cites a §-number)
6. Test gates (a11y-axe + snapshots + full suite + tsc)

For gate 6, RUN these commands yourself:
- `source ~/.nvm/nvm.sh && nvm use 22 && npm test -- --testPathPattern="a11y-axe"`
- `source ~/.nvm/nvm.sh && nvm use 22 && npm test -- --testPathPattern="snapshots"`
- `source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit`

DO NOT update snapshots. DO NOT modify any files. This is a review, not a fix.

## Step 4 — report

Use this exact structure:

## Pass | Concerns | Blockers
(one-line summary or "none" per category — concerns block soft, blockers block hard)

## Files reviewed
(list each touched template file with one-line description of the change)

## Gate results
1. Motion budget: pass / concern / blocker (+ one line)
2. Reduced motion: …
3. Accessibility: …
4. Static SSR: …
5. Pattern-library reuse: …
6. Test gates: …

## Recommendations
(numbered list — most important first; skip if all pass)

## New primitives discovered
(description for back-port to motion-patterns.md, or "none")

## Verdict
APPROVED / NEEDS-CHANGES / BLOCKED — with one sentence why.
```

When the agent returns, surface its full report verbatim to the user.
Do not editorialize. The user reads the report directly to decide
whether to merge.

If the user passed `$ARGUMENTS` (e.g. `/review-template-motion HEAD~5`),
substitute that into the agent prompt as the base ref instead of `main`.
