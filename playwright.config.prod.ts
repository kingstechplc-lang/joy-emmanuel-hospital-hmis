import { defineConfig, devices } from "@playwright/test";

// Production-override Playwright config — runs the e2e suite against the
// deployed Vercel app instead of a local dev server. Used for Phase 12
// final build gate verification of the CDSS subsystem on production.
//
// Run with:
//   bunx playwright test --config=playwright.config.prod.ts --project=chromium
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: "https://joy-emmanuel-hospital-hmis.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 60000,
    actionTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
