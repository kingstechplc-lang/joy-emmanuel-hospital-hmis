import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for the HMIS.
 *
 * Tests run against a local dev server (next dev -p 3000).
 * The developer must start the server manually OR use the webServer config below.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Sequential — shared DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker — shared DB state
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
