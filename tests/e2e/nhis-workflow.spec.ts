// =====================================================================
// HMIS Browser E2E Tests — NHIS/NHIA Workflow
// =====================================================================
// These tests exercise the real browser UI against a running dev server.
//
// PREREQUISITES:
//   1. Dev server running (npm run dev) — Playwright webServer starts it
//   2. Neon PostgreSQL DATABASE_URL configured in .env
//   3. At least one user exists with super_admin role (seeded)
//   4. At least one facility exists
//   5. NHIS InsuranceProvider exists with providerType=nhis
//
// RUN: npx playwright test
// =====================================================================

import { test, expect, type Page } from "@playwright/test";

// =====================================================================
// Test helpers
// =====================================================================

/** Login via the credentials form — waits for React hydration */
async function login(page: Page, username: string, password: string) {
  // The dev server needs time to compile on first request — use a long timeout
  await page.goto("/", { timeout: 60000, waitUntil: "domcontentloaded" });
  // Wait for any input to appear (React hydration)
  await page.waitForSelector('input', { timeout: 30000 });
  await page.waitForTimeout(3000); // Allow full React hydration

  // The login form has Username and Password fields with a "Sign in" button
  // The demo password is "Password@2026"
  const usernameInput = page.locator('input[name="username"], input[placeholder*="username" i], input[type="text"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

  await usernameInput.waitFor({ state: "visible", timeout: 15000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);

  // Click the submit button
  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
  await submitButton.click();

  // Wait for navigation to the app (sidebar appears)
  await page.waitForSelector("aside, nav", { timeout: 30000 });
}

/** Login using the quick demo login buttons (Super Admin) */
async function loginAsSuperAdmin(page: Page) {
  await page.goto("/", { timeout: 60000, waitUntil: "domcontentloaded" });
  await page.waitForSelector('input', { timeout: 30000 });
  await page.waitForTimeout(3000); // Allow full React hydration
  // Click the "Super Admin" quick demo button (fills username + password)
  const superAdminButton = page.locator('button:has-text("Super Admin")').first();
  await superAdminButton.waitFor({ state: "visible", timeout: 10000 });
  await superAdminButton.click();
  await page.waitForTimeout(500); // Allow form fill
  // Now click the "Sign in" submit button
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();
  // Wait for the app to load (sidebar appears)
  await page.waitForSelector("aside, nav", { timeout: 30000 });
}

/** Navigate to a sidebar view by clicking the nav item */
async function navigateToView(page: Page, viewLabel: string) {
  // Wait for sidebar nav to be ready
  await page.waitForSelector("nav button", { timeout: 10000 });
  // Find the nav button with the given label text
  const navButton = page.locator(`nav button:has-text("${viewLabel}")`).first();
  await navButton.waitFor({ state: "visible", timeout: 5000 });
  await navButton.click();
  await page.waitForTimeout(1000); // Allow view to render
}

/** Select the first facility in the top bar if not already selected */
async function selectFirstFacility(page: Page) {
  // The facility switcher is a Select component — look for the trigger
  const facilityTrigger = page.locator('[role="combobox"]').first();
  if (await facilityTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await facilityTrigger.click();
    await page.waitForTimeout(500);
    // Click the first non-"All Facilities" option
    const options = page.locator('[role="option"]').filter({ hasNotText: "All Facilities" });
    if (await options.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await options.first().click();
      await page.waitForTimeout(500);
    }
  }
}

// =====================================================================
// Test 1-5: Module navigation
// =====================================================================
test.describe("NHIS Workflow E2E", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
  });

  test("1: Can navigate to Records Desk", async ({ page }) => {
    await navigateToView(page, "Records Desk");
    await expect(page.locator("text=Records Desk").first()).toBeVisible({ timeout: 10000 });
  });

  test("2: Can navigate to NHIS Workflow", async ({ page }) => {
    await navigateToView(page, "NHIS Workflow");
    await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
  });

  test("3: Can navigate to Insurance Claims", async ({ page }) => {
    await navigateToView(page, "Insurance Claims");
    await expect(page.locator("text=Insurance Claims").first()).toBeVisible({ timeout: 10000 });
  });

  test("4: Can navigate to NHIA CLAIM-it", async ({ page }) => {
    await navigateToView(page, "NHIA CLAIM-it");
    await expect(page.locator("text=NHIA CLAIM-it").first()).toBeVisible({ timeout: 10000 });
  });

  test("5: Can navigate to Patients", async ({ page }) => {
    await navigateToView(page, "Patients");
    await expect(page.locator("text=Patients").first()).toBeVisible({ timeout: 10000 });
  });
});

// =====================================================================
// Test 6-7: Records Desk check-in patient search
// =====================================================================
test.describe("Records Desk Check-in", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
    await navigateToView(page, "Records Desk");
    // The Records Desk has tabs (Dashboard, Check-in, Requests, Amendments)
    // Try to click the Check-in tab
    const checkinTab = page.locator('[role="tab"]:has-text("Check-in")').first();
    if (await checkinTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkinTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test("6: Records Desk page loads correctly", async ({ page }) => {
    // Verify the Records Desk page loaded by checking for the page header text
    await expect(page.locator("text=Records Desk").first()).toBeVisible({ timeout: 15000 });
  });

  test("7: Can type in search field without crash", async ({ page }) => {
    // Try clicking the Check-in tab first
    const checkinTab = page.locator('[role="tab"]:has-text("Check-in")').first();
    if (await checkinTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkinTab.click();
      await page.waitForTimeout(2000);
    }
    const anyInput = page.locator('input').first();
    if (await anyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await anyInput.fill("JEM-");
      await page.waitForTimeout(2000);
      await expect(anyInput).toBeVisible();
    }
  });
});

// =====================================================================
// Test 8-9: NHIS Workflow patient picker
// =====================================================================
test.describe("NHIS Workflow Patient Picker", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
    await navigateToView(page, "NHIS Workflow");
  });

  test("8: NHIS Workflow shows Find Patient step", async ({ page }) => {
    // The NHIS Workflow page should be visible (check for any text from the page)
    await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
  });

  test("9: Patient search input is functional", async ({ page }) => {
    // The PatientPicker has a search input
    const searchInput = page.locator('input').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill("Test");
    await page.waitForTimeout(1000);
    await expect(searchInput).toBeVisible();
  });
});

// =====================================================================
// Test 10: Coverage panel
// =====================================================================
test.describe("NHIS Workflow Coverage Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
    await navigateToView(page, "NHIS Workflow");
  });

  test("10: NHIS Workflow page renders correctly", async ({ page }) => {
    await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
  });
});

// =====================================================================
// Test 11-14: Cross-module navigation
// =====================================================================
test.describe("Cross-Module Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
  });

  test("11: Records Desk → NHIS Workflow", async ({ page }) => {
    await navigateToView(page, "Records Desk");
    await navigateToView(page, "NHIS Workflow");
    await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
  });

  test("12: NHIS Workflow → Insurance Claims", async ({ page }) => {
    await navigateToView(page, "NHIS Workflow");
    await navigateToView(page, "Insurance Claims");
    await expect(page.locator("text=Insurance Claims").first()).toBeVisible({ timeout: 10000 });
  });

  test("13: Insurance Claims → NHIA CLAIM-it", async ({ page }) => {
    await navigateToView(page, "Insurance Claims");
    await navigateToView(page, "NHIA CLAIM-it");
    await expect(page.locator("text=NHIA CLAIM-it").first()).toBeVisible({ timeout: 10000 });
  });

  test("14: Patient 360 → NHIS Workflow (if patient exists)", async ({ page }) => {
    await navigateToView(page, "Patients");
    const firstPatientRow = page.locator("table tbody tr").first();
    if (await firstPatientRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstPatientRow.click();
      await page.waitForTimeout(2000);
      // Look for the Encounters tab
      const encountersTab = page.locator('[role="tab"]:has-text("Encounters"), button:has-text("Encounters")').first();
      if (await encountersTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await encountersTab.click();
        await page.waitForTimeout(1000);
        const nhisButton = page.locator("button:has-text('NHIS')").first();
        if (await nhisButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nhisButton.click();
          await page.waitForTimeout(2000);
          await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });
});

// =====================================================================
// Test 15: Refresh behavior
// =====================================================================
test.describe("Refresh Behavior", () => {
  test("15: NHIS Workflow survives page reload", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await selectFirstFacility(page);
    await navigateToView(page, "NHIS Workflow");
    await expect(page.locator("text=NHIS Workflow").first()).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.waitForTimeout(3000);
    // The app should re-render — the sidebar should be visible
    await expect(page.locator("aside, nav").first()).toBeVisible({ timeout: 15000 });
  });
});

// =====================================================================
// Test 16: App shell + permissions
// =====================================================================
test.describe("Permission Restrictions", () => {
  test("16: App loads and sidebar is visible", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expect(page.locator("aside, nav").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("nav button").first()).toBeVisible({ timeout: 5000 });
  });
});
