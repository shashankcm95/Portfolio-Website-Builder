import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config.
 *
 * These tests run against a *local* dev server. We deliberately don't require
 * a real database — all tests use a mocked auth layer (see tests/e2e/fixtures)
 * and, where practical, intercept outbound API requests.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: {
          // Mark dev as an e2e run; the app can use this to short-circuit
          // expensive side-effects (e.g. OpenAI calls).
          E2E: "1",
        },
      },
});
