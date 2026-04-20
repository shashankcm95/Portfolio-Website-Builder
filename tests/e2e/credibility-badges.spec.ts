import { test, expect } from "@playwright/test";

/**
 * E2E: credibility badges render on a project card after adding a GitHub repo.
 *
 * These tests are `test.skip()` for the same reason as the persona specs —
 * they require: (1) a seeded Postgres, (2) mocked / test-mode auth with an
 * OAuth token stored on `users.githubToken`, (3) network access to GitHub's
 * public REST API (rate-limited). When the infra is wired, flip `.skip`
 * to run them. The assertions themselves are stable because we pin the
 * target repo by commit SHA in the refresh checks.
 */

test.describe("Credibility badges", () => {
  test.skip("adding a public GitHub repo renders badges within ~2s", async ({
    page,
  }) => {
    // 1. Sign in via test-mode auth (E2E=1 bypass).
    // 2. Create a portfolio.
    // 3. Go to projects tab, paste a pinned public repo (e.g.
    //    https://github.com/anthropics/claude-code at a specific SHA — a
    //    small, public-stable repo we control or is known-stable).
    // 4. Validate → Add to Portfolio.
    // 5. Expect the card to render compact credibility badges:
    //    - "CI passing" OR "No CI" (whichever applies to the pinned state)
    //    - A "{N} commits · {year}" badge with N > 0
    //    - A language chip (e.g. "TypeScript {pct}%")
    //    - "Verified just now" stamp with a refresh button
    const badges = page.getByTestId("credibility-badges-compact");
    await expect(badges).toBeVisible({ timeout: 3000 });
    await expect(badges).toContainText(/commits/);
  });

  test.skip("refresh button re-fetches and updates the Verified stamp", async ({
    page,
  }) => {
    // 1. Navigate to a portfolio with an analyzed project.
    // 2. Find the credibility badge row and click the RotateCw refresh button.
    // 3. Expect the "Verified Xm ago" stamp to change to "Verified just now".
    // 4. Click again immediately → expect 429 → "Refreshed too recently" error.
  });

  test.skip("detail page shows the full credibility layout with language bar", async ({
    page,
  }) => {
    // 1. Navigate to /portfolios/:pid/projects/:prid
    // 2. Expect the <CredibilityBadges /> full layout (data-testid=
    //    "credibility-badges-full") with language-breakdown bar (each
    //    segment titled by language name + pct).
    // 3. Expect all 11 signal groupings rendered (4 sections).
  });

  test.skip("manual projects do NOT render the credibility row", async ({
    page,
  }) => {
    // 1. Add a manual project (Manual tab in RepoAddForm).
    // 2. Expect the project card to render normally WITHOUT the
    //    credibility-badges-compact row.
  });
});
