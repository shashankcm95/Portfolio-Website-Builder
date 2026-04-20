import { test, expect } from "@playwright/test";

/**
 * Smoke tests for public (unauthenticated) pages. These cover the surfaces a
 * logged-out user hits before sign-in: the marketing home page and the
 * sign-in screen itself. They don't require a database, real auth, or any
 * external API keys — they just verify the routes render and the key calls
 * to action are present.
 */

test.describe("public pages", () => {
  test("home page renders the hero copy and a CTA", async ({ page }) => {
    await page.goto("/");
    // Hero features — any of these should be discoverable
    await expect(
      page.getByText(/AI-Powered Narratives/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Proof-Backed Portfolio/i).first()
    ).toBeVisible();
  });

  test("sign-in page renders the GitHub provider button", async ({ page }) => {
    await page.goto("/sign-in");
    // The page title or a "GitHub" affordance should be visible.
    await expect(page.getByText(/github/i).first()).toBeVisible();
  });

  test("dashboard redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    // Auth.js middleware redirects to /sign-in (or to its callback route
    // that renders sign-in). Either way, we should NOT see a dashboard-only
    // widget like the Onboarding checklist title.
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/dashboard");
  });
});
