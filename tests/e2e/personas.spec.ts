import { test } from "@playwright/test";

/**
 * Persona e2e journeys for the four target users: Priya, Marcus, Lena, Ahmed.
 *
 * These tests encode each persona's critical path through the app. They are
 * currently `test.skip()` because a full run requires:
 *   1. A seeded Postgres (docker-compose up -d db && drizzle-kit push)
 *   2. Mocked / test-mode auth (Auth.js credentials adapter or a test-only
 *      bypass gated on process.env.E2E=1 — the hook is already wired in
 *      playwright.config.ts but not yet consumed by the app)
 *   3. Mocked external APIs (Claude, OpenAI, GitHub, Cloudflare)
 *
 * When the infrastructure above lands, flip `.skip` to `.only` (for isolated
 * runs) or remove `.skip` entirely.
 */

test.describe("Persona A — Priya (new grad, fast-track to shareable link)", () => {
  test.skip("sign-in → upload resume → create portfolio → add repo → deploy", async () => {
    // 1. Sign in via test-mode auth
    // 2. Navigate to Settings, upload a resume PDF, see "Resume parsed!" banner
    // 3. Follow the Next-Step CTA to /portfolios/new
    // 4. Create portfolio "Priya Portfolio"
    // 5. Projects tab shows onboarding banner "Step 2/3"
    // 6. Paste a GitHub URL, click Validate, click Add to Portfolio
    // 7. Click Analyze, watch PipelineStatus, wait for completion
    // 8. Inline CTA "See Preview" → verify preview iframe renders
    // 9. Deploy tab → Deploy Now → verify .pages.dev URL appears
    // 10. Refresh page → verify deploy URL persists (regression for Wave 2C)
  });
});

test.describe("Persona B — Marcus (mid-career, trust-in-AI matters)", () => {
  test.skip("analyze project → edit a narrative sentence → save persists", async () => {
    // 1. Sign in, navigate to an already-analyzed project
    // 2. Open narrative view, click into a SectionEditor
    // 3. Edit a sentence, click Save
    // 4. Assert toast "Saved" appears (not a silent no-op — Wave 1A fix)
    // 5. Reload page, verify edit persists (isUserEdited=true in DB)
  });

  test.skip("click a claim → popover shows real evidence from claimMap", async () => {
    // 1. On a narrative, click a sentence with a claim indicator
    // 2. Popover should reveal: backing fact + evidence ref (file:line)
    // 3. Verify content originates from /api/projects/:id/claim-map, not regex parsing
  });

  test.skip("regenerate only one section — pipeline does not re-run end-to-end", async () => {
    // 1. On a section, click Regenerate
    // 2. Only that section's spinner appears
    // 3. Verify POST to /api/projects/:id/sections/:id/regenerate fires
    // 4. Other sections remain untouched
  });
});

test.describe("Persona C — Lena (designer, needs visual/layout control)", () => {
  test.skip("sees honest template-picker state (only Minimal available)", async () => {
    // 1. Go to /portfolios/new
    // 2. Only Minimal is selectable; other cards show "Coming soon" pill
    //    (Wave 1C honest-hide implementation)
  });

  test.skip("can add a manual (non-GitHub) project", async () => {
    // 1. Portfolio detail → Projects tab → click Manual tab in RepoAddForm
    // 2. Fill name + description + tech stack, submit
    // 3. Project appears in list with "Manual" badge (not Analyze button)
  });

  test.skip("can edit portfolio name + slug from Settings tab", async () => {
    // 1. Portfolio detail → Settings tab
    // 2. Rename portfolio; slug-collision warning if duplicate
    // 3. Save → navigate to new slug URL, should resolve
  });
});

test.describe("Persona D — Ahmed (returning user, surgical updates)", () => {
  test.skip("dashboard shows real recent activity (not hardcoded stub)", async () => {
    // 1. Sign in as a user with >1 portfolio, past deploys, past analyses
    // 2. Dashboard ActivityFeed renders merged events, most-recent first
    //    (Wave 3A — verifies feed ordering)
  });

  test.skip("onboarding checklist hides once a user has deployed", async () => {
    // 1. User with hasResume + hasPortfolio + hasProject + hasDeployment
    // 2. Verify OnboardingChecklist is NOT rendered (showOnboarding guard)
  });

  test.skip("re-analyzing a project warns before overwriting user edits", async () => {
    // 1. Project has isUserEdited sections
    // 2. Click Re-Analyze → modal prompts "You have manual edits that will be
    //    overwritten. Continue?"
    // 3. Only on confirm does pipeline restart
  });
});
