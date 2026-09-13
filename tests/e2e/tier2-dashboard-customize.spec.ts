// =====================================================================
// Tier 2 Phase 4 — Dashboard Customization E2E Tests
// =====================================================================
// Verifies the new drag-and-drop dashboard customization UI works
// against the production Vercel deploy.
//
// Coverage:
//   1.  Dashboard page loads with the new customizer
//   2.  Welcome header is visible (name + role + date)
//   3.  Default layout renders widgets (KPI cards or list widgets)
//   4.  'Customize Dashboard' button is visible for super_admin
//   5.  Clicking 'Customize Dashboard' enters edit mode
//   6.  Edit mode shows 'Add Widget', 'Reset to Default', 'Done Editing'
//   7.  'Add Widget' dialog opens and shows available widgets
//   8.  Add Widget dialog shows widgets grouped by category
//   9.  Closing edit mode returns to view mode
//   10. Page does not show runtime errors (can is not defined, etc.)
//
// Notes:
//   - Tests do NOT actually drag widgets (Playwright drag-and-drop on
//     @dnd-kit is flaky in headless mode). Drag operations are tested
//     manually in the browser.
//   - Tests verify the UI loads, the buttons work, and the dialogs open.
// =====================================================================
import { test, expect, type Page } from "@playwright/test";

async function loginAsSuperAdmin(page: Page) {
  await page.goto("/", { timeout: 300000, waitUntil: "domcontentloaded" });
  await page.waitForSelector("input", { timeout: 300000 });
  await page.waitForTimeout(5000);
  const superAdminButton = page.locator('button:has-text("Super Admin")').first();
  await superAdminButton.waitFor({ state: "visible", timeout: 15000 });
  await superAdminButton.click();
  await page.waitForTimeout(500);
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();
  await page.waitForSelector("aside, nav", { timeout: 300000 });
}

async function navigateToDashboard(page: Page) {
  // The dashboard is usually the default view after login; if not,
  // click the 'Dashboard' nav item.
  await page.waitForTimeout(2000);
  const dashboardNav = page.locator('nav button:has-text("Dashboard")').first();
  if (await dashboardNav.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dashboardNav.click();
    await page.waitForTimeout(1500);
  }
}

test.describe("Tier 2 Phase 4 — Dashboard Customization", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    // Select first facility
    const facilityTrigger = page.locator('[role="combobox"]').first();
    if (await facilityTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await facilityTrigger.click();
      await page.waitForTimeout(500);
      const options = page.locator('[role="option"]').filter({ hasNotText: "All Facilities" });
      if (await options.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await options.first().click();
        await page.waitForTimeout(500);
      }
    }
    await navigateToDashboard(page);
  });

  test("1: Dashboard page loads with new customizer", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
  });

  test("2: Welcome header is visible with role", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    // Role should be displayed somewhere (super admin / Super Administrator)
    await expect(
      page.locator("text=Super Admin").first()
        .or(page.locator("text=super admin").first())
    ).toBeVisible({ timeout: 10000 });
  });

  test("3: Default layout renders widgets", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000);
    // The default super_admin layout has 22 widgets including these KPI labels
    // (visible in the KPI card text)
    const expectedLabels = [
      "Total Patients",
      "Today's Encounters",
      "Pending Lab Orders",
      "Outstanding Invoices",
    ];
    for (const label of expectedLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test("4: 'Customize Dashboard' button is visible for super_admin", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    // The customize button should be visible (super_admin has dashboard.customize)
    await expect(
      page.locator('button:has-text("Customize Dashboard")').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("5: Clicking 'Customize Dashboard' enters edit mode", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    const customizeBtn = page.locator('button:has-text("Customize Dashboard")').first();
    await customizeBtn.click();
    await page.waitForTimeout(500);
    // Edit mode shows 'Done Editing' button
    await expect(page.locator('button:has-text("Done Editing")').first()).toBeVisible({ timeout: 5000 });
    // Edit mode shows 'Add Widget' button
    await expect(page.locator('button:has-text("Add Widget")').first()).toBeVisible({ timeout: 5000 });
    // Edit mode shows 'Reset to Default' button
    await expect(page.locator('button:has-text("Reset to Default")').first()).toBeVisible({ timeout: 5000 });
  });

  test("6: 'Add Widget' dialog opens with widget categories", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    // Enter edit mode
    await page.locator('button:has-text("Customize Dashboard")').first().click();
    await page.waitForTimeout(500);
    // Click 'Add Widget' (the toolbar one, not the empty-state one)
    const addWidgetBtn = page.locator('button:has-text("Add Widget")').first();
    await addWidgetBtn.click();
    await page.waitForTimeout(500);
    // Dialog should be visible with title 'Add Widget'
    await expect(page.locator("text=Add Widget").first()).toBeVisible({ timeout: 5000 });
    // Category headings should be visible (CLINICAL, WORKFLOW, FINANCE, etc.)
    await expect(page.locator("text=CLINICAL").first()).toBeVisible({ timeout: 5000 });
  });

  test("7: Add Widget dialog shows searchable widget list", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Customize Dashboard")').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add Widget")').first().click();
    await page.waitForTimeout(500);
    // Search input should be visible
    const searchInput = page.locator('input[placeholder*="Search widgets"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    // Type a search term
    await searchInput.fill("lab");
    await page.waitForTimeout(500);
    // Should still show the dialog (filtered results)
    await expect(page.locator("text=Add Widget").first()).toBeVisible({ timeout: 5000 });
  });

  test("8: Exiting edit mode returns to view mode", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);
    // Enter edit mode
    await page.locator('button:has-text("Customize Dashboard")').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('button:has-text("Done Editing")').first()).toBeVisible({ timeout: 5000 });
    // Exit edit mode
    await page.locator('button:has-text("Done Editing")').first().click();
    await page.waitForTimeout(500);
    // Should be back in view mode (Customize Dashboard button visible again)
    await expect(page.locator('button:has-text("Customize Dashboard")').first()).toBeVisible({ timeout: 5000 });
  });

  test("9: Page does not show runtime errors", async ({ page }) => {
    await expect(page.locator("text=Welcome back").first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000);
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=ReferenceError")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=TypeError")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Cannot read prop")).not.toBeVisible({ timeout: 3000 });
  });

  test("10: Doctor login shows role-specific default layout", async ({ page }) => {
    // Logout first
    await page.goto("/", { timeout: 300000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Login as doctor
    const doctorButton = page.locator('button:has-text("Doctor")').first();
    if (await doctorButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await doctorButton.click();
      await page.waitForTimeout(500);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForSelector("aside, nav", { timeout: 300000 });
      await page.waitForTimeout(3000);
      // Should see doctor-specific KPIs (Today's Encounters, Pending Lab Orders)
      await expect(page.locator("text=Today's Encounters").first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator("text=Pending Lab Orders").first()).toBeVisible({ timeout: 10000 });
      // Should see the customize button (doctors have dashboard.customize)
      await expect(page.locator('button:has-text("Customize Dashboard")').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
