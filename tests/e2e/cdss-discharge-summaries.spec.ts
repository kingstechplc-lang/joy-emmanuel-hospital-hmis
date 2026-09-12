// =====================================================================
// CDSS Discharge Summaries — Browser E2E Tests
// =====================================================================
// Phase 12 final-build gate for the Discharge Summary subsystem.
//
// Coverage:
//   1.  Discharge Summaries page loads
//   2.  Page header is visible ("Discharge Summaries")
//   3.  6 KPI stat cards render (Total, Drafts, Reviewed, Approved,
//       Finalized, Amended)
//   4.  Status filter buttons render
//   5.  Empty state or summary list is visible (no crash)
//   6.  "New Discharge Summary" button is visible (only if user has
//       discharge_summary.create permission — superadmin has it)
//   7.  Page does not show "can is not defined" or other ReferenceError
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

async function navigateToView(page: Page, viewLabel: string) {
  await page.waitForSelector("nav button", { timeout: 10000 });
  const navButton = page.locator(`nav button:has-text("${viewLabel}")`).first();
  await navButton.waitFor({ state: "visible", timeout: 5000 });
  await navButton.click();
  await page.waitForTimeout(1500);
}

test.describe("CDSS Discharge Summaries", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
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
  });

  test("1: Discharge Summaries page loads", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
  });

  test("2: KPI stat cards render", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    // KPI labels from source: Total, Drafts, Reviewed, Approved, Finalized, Amended
    await expect(page.locator("text=Drafts").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Reviewed").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Approved").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Finalized").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Amended").first()).toBeVisible({ timeout: 10000 });
  });

  test("3: Status filter buttons render", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    const allFilter = page.locator('button:has-text("All")').first();
    await expect(allFilter).toBeVisible({ timeout: 10000 });
  });

  test("4: New Discharge Summary button is visible", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    // superadmin has discharge_summary.create — the New button should be visible
    await expect(
      page.locator('button:has-text("New")').first()
        .or(page.locator('button:has-text("Create")').first())
    ).toBeVisible({ timeout: 10000 });
  });

  test("5: Empty state or summary list is visible", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const hasRows = await page.locator("table tbody tr").first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRows) {
      await expect(
        page.locator("text=No discharge summaries").first()
          .or(page.locator("text=No discharge summaries yet").first())
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("6: Page does not show runtime errors", async ({ page }) => {
    await navigateToView(page, "Discharge Summaries");
    await expect(page.locator("text=Discharge Summaries").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=ReferenceError")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=TypeError")).not.toBeVisible({ timeout: 3000 });
  });
});
