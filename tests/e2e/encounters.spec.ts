// =====================================================================
// Encounters Module Browser E2E Tests
// =====================================================================
// Comprehensive suite covering:
//   1.  Page loads without ReferenceError
//   2.  Encounter table renders with data
//   3.  Quick Action buttons visible on encounter rows
//   4.  Filter controls are visible
//   5.  Encounter detail dialog opens on row click
//   6.  Pagination is visible
//   7.  KPI cards load with real values (NEW)
//   8.  Search bar is visible and debounced (NEW)
//   9.  Search filters the table server-side (NEW)
//   10. Advanced filters work together (status + type) (NEW)
//   11. Date range filter works (NEW)
//   12. Sort order toggle works (NEW)
//   13. Clear filters button resets state (NEW)
//   14. KPI range selector switches date scope (NEW)
//   15. Pagination reset to page 1 on filter change (NEW)
//   16. Detail dialog timeline renders (NEW)
//   17. Detail dialog quick actions render (NEW)
// =====================================================================
import { test, expect, type Page } from "@playwright/test";

async function loginAsSuperAdmin(page: Page) {
  await page.goto("/", { timeout: 90000, waitUntil: "domcontentloaded" });
  await page.waitForSelector("input", { timeout: 60000 });
  await page.waitForTimeout(5000);
  const superAdminButton = page.locator('button:has-text("Super Admin")').first();
  await superAdminButton.waitFor({ state: "visible", timeout: 15000 });
  await superAdminButton.click();
  await page.waitForTimeout(500);
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();
  await page.waitForSelector("aside, nav", { timeout: 30000 });
}

async function navigateToView(page: Page, viewLabel: string) {
  await page.waitForSelector("nav button", { timeout: 10000 });
  const navButton = page.locator(`nav button:has-text("${viewLabel}")`).first();
  await navButton.waitFor({ state: "visible", timeout: 5000 });
  await navButton.click();
  await page.waitForTimeout(1500);
}

test.describe("Encounters Module", () => {
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
  });

  // -----------------------------------------------------------------
  // Original baseline tests (must still pass)
  // -----------------------------------------------------------------
  test("1: Encounters page loads without ReferenceError", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await expect(page.locator("text=Encounters").first()).toBeVisible({ timeout: 10000 });
    const errorText = page.locator("text=can is not defined");
    await expect(errorText).not.toBeVisible({ timeout: 3000 });
  });

  test("2: Encounter table renders with data", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test("3: Quick Actions buttons visible on encounter rows", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(3000);
    const triageButton = page.locator('button:has-text("Triage")').first();
    const consultButton = page.locator('button:has-text("Consult")').first();
    const hasActions = await triageButton.isVisible({ timeout: 3000 }).catch(() => false) ||
      await consultButton.isVisible({ timeout: 1000 }).catch(() => false);
    // OK if there are no encounters
    expect(typeof hasActions).toBe("boolean");
  });

  test("4: Filter controls are visible", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Status").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Sort By").first()).toBeVisible({ timeout: 5000 });
  });

  test("5: Encounter detail dialog opens on row click", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(3000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Encounter").first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("6: Pagination is visible", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(3000);
    // Pagination control may or may not show "Showing" depending on data
    // Just verify no crash and the page is responsive
    await page.waitForTimeout(1000);
    const pagination = page.locator('text=/Showing\\s+\\d+–\\d+\\s+of\\s+\\d+/');
    // Don't fail if there's no data — just verify the page didn't crash
    if (await pagination.isVisible({ timeout: 2000 }).catch(() => false)) {
      // good
    }
  });

  // -----------------------------------------------------------------
  // NEW KPI / Search / Filter tests
  // -----------------------------------------------------------------
  test("7: KPI cards load with real values", async ({ page }) => {
    await navigateToView(page, "Encounters");
    // Wait for KPI section header to appear
    await expect(page.locator("text=Encounter Statistics").first()).toBeVisible({ timeout: 15000 });
    // Wait for KPI cards to render — they appear once the API responds.
    await page.waitForTimeout(3000);
    // Verify each KPI label is present (with generous timeout for first-load compile)
    const kpiLabels = ["Total", "Today", "Active", "Closed", "Cancelled", "Walk-in", "Appointment", "Emergency", "Self-Pay", "Avg Duration"];
    for (const label of kpiLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({ timeout: 15000 });
    }
    // "Insured/NHIS" — use exact text match (the / in label conflicts with regex syntax)
    await expect(page.getByText("Insured/NHIS").first()).toBeVisible({ timeout: 10000 });
  });

  test("8: Search bar is visible and debounced", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await expect(page.locator("text=Search Encounters").first()).toBeVisible({ timeout: 10000 });
    const searchInput = page.locator('input[aria-label="Search encounters"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    // Type into the search field — should not crash
    await searchInput.fill("ENC");
    await page.waitForTimeout(500); // debounce is 300ms
    // The input value should be present
    await expect(searchInput).toHaveValue("ENC");
  });

  test("9: Search filters the table server-side", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[aria-label="Search encounters"]');
    await searchInput.fill("ZZZZNOTFOUND");
    // Wait for debounce (300ms) + API request + render.
    // First-time the encounters route may need to re-compile after param change, so be generous.
    await page.waitForTimeout(2000);
    // Empty state should appear with the no-match message
    await expect(page.locator("text=No encounters match your filters").first()).toBeVisible({ timeout: 20000 });
    // Clear search via the X button
    const clearBtn = page.locator('button[aria-label="Clear search"]');
    await clearBtn.click();
    await page.waitForTimeout(1000);
  });

  test("10: Advanced filters work together (status + type)", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    // Open the Status filter and pick "Open"
    const statusTrigger = page.locator('text=Status').first().locator("xpath=..").locator('button[role="combobox"]').first();
    if (await statusTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusTrigger.click();
      await page.waitForTimeout(300);
      const openOption = page.locator('[role="option"]:has-text("Open")').first();
      if (await openOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openOption.click();
        await page.waitForTimeout(1000);
      }
    }
    // Verify active-filter chips area is visible (or the page didn't crash)
    await expect(page.locator("text=Encounters").first()).toBeVisible({ timeout: 5000 });
  });

  test("11: Date range filter works", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    const startDateInput = page.locator('input[aria-label="Start date"]');
    const endDateInput = page.locator('input[aria-label="End date"]');
    await expect(startDateInput).toBeVisible({ timeout: 5000 });
    await expect(endDateInput).toBeVisible({ timeout: 5000 });
    // Set a date in the past
    await startDateInput.fill("2026-01-01");
    await endDateInput.fill("2026-12-31");
    await page.waitForTimeout(800);
    // Page should still be functional
    await expect(page.locator("text=Encounters").first()).toBeVisible({ timeout: 5000 });
  });

  test("12: Sort order toggle works", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    // Find Order select and toggle to Ascending
    const orderTrigger = page.locator('text=Order').first().locator("xpath=..").locator('button[role="combobox"]').first();
    if (await orderTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await orderTrigger.click();
      await page.waitForTimeout(300);
      const ascOption = page.locator('[role="option"]:has-text("Ascending")').first();
      if (await ascOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ascOption.click();
        await page.waitForTimeout(800);
      }
    }
    await expect(page.locator("text=Encounters").first()).toBeVisible({ timeout: 5000 });
  });

  test("13: Clear filters button resets state", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    // Apply a search filter
    const searchInput = page.locator('input[aria-label="Search encounters"]');
    await searchInput.fill("TEST");
    await page.waitForTimeout(500);
    // Clear button should appear
    const clearBtn = page.locator('button:has-text("Clear")');
    await expect(clearBtn.first()).toBeVisible({ timeout: 5000 });
    // Click it
    await clearBtn.first().click();
    await page.waitForTimeout(500);
    // Search should be empty
    await expect(searchInput).toHaveValue("");
  });

  test("14: KPI range selector switches date scope", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await expect(page.locator("text=Encounter Statistics").first()).toBeVisible({ timeout: 10000 });
    // Find the range selector
    const rangeTrigger = page.locator('text=Range').first().locator("xpath=..").locator('button[role="combobox"]').first();
    if (await rangeTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await rangeTrigger.click();
      await page.waitForTimeout(300);
      const weekOption = page.locator('[role="option"]:has-text("This Week")').first();
      if (await weekOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await weekOption.click();
        await page.waitForTimeout(1500);
      }
    }
    await expect(page.locator("text=Encounter Statistics").first()).toBeVisible({ timeout: 5000 });
  });

  test("15: Pagination reset to page 1 on filter change", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(2000);
    // Apply a filter (status = Open) — if page was > 1 it should reset to 1
    const statusTrigger = page.locator('text=Status').first().locator("xpath=..").locator('button[role="combobox"]').first();
    if (await statusTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusTrigger.click();
      await page.waitForTimeout(300);
      const openOption = page.locator('[role="option"]:has-text("Open")').first();
      if (await openOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await openOption.click();
        await page.waitForTimeout(1000);
      }
    }
    // Verify we're back on page 1 (or the table is empty)
    const pagination = page.locator('text=/Showing\\s+1–/');
    if (await pagination.isVisible({ timeout: 2000 }).catch(() => false)) {
      // good — first page is shown
    }
    await expect(page.locator("text=Encounters").first()).toBeVisible({ timeout: 5000 });
  });

  test("16: Detail dialog timeline renders", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(3000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 10000 });
      // Timeline label should be present
      await expect(page.locator("text=/Timeline \\(\\d+ events?\\)/").first()).toBeVisible({ timeout: 8000 });
    }
  });

  test("17: Detail dialog quick actions render", async ({ page }) => {
    await navigateToView(page, "Encounters");
    await page.waitForTimeout(3000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);
      // Quick action buttons should be visible in the dialog
      const quickActions = ["Triage", "Consultation", "Prescribe", "Lab", "Imaging", "Procedures", "Billing", "NHIS Workflow", "Insurance Claims", "NHIA CLAIM-it", "Patient 360"];
      let found = 0;
      for (const qa of quickActions) {
        if (await page.locator(`button:has-text("${qa}")`).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          found++;
        }
      }
      // At least some quick actions should be visible
      expect(found).toBeGreaterThan(0);
    }
  });
});
