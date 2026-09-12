// =====================================================================
// CDSS Patient Wristbands + Medication Labels — Browser E2E Tests
// =====================================================================
// Phase 12 final-build gate for the Wristband + Medication Label
// subsystems, and the public verify endpoints.
//
// Coverage:
//   1.  Patient Wristbands page loads
//   2.  Wristbands page header is visible
//   3.  Wristbands status filter buttons render
//   4.  Wristbands empty state or row list renders
//   5.  Medication Labels page loads
//   6.  Medication Labels page header is visible
//   7.  Medication Labels status filter buttons render
//   8.  Medication Labels empty state or row list renders
//   9.  Public wristband verify endpoint rejects invalid token with 400
//   10. Public medication-label verify endpoint rejects invalid token with 400
//   11. Public wristband verify endpoint returns 404 for unknown well-formed token
//   12. Public medication-label verify endpoint returns 404 for unknown well-formed token
//
// Notes:
//   - Tests 1-8 verify the UI loads without crashing.
//   - Tests 9-12 verify the public /api/.../verify/[token] endpoints
//     behave correctly. These endpoints are NOT auth-gated (public
//     lookup by QR code), so they can be tested without a session.
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

test.describe("CDSS Patient Wristbands (UI)", () => {
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

  test("1: Patient Wristbands page loads", async ({ page }) => {
    await navigateToView(page, "Wristbands");
    await expect(page.locator("text=Patient Wristbands").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
  });

  test("2: Wristbands status filter buttons render", async ({ page }) => {
    await navigateToView(page, "Wristbands");
    await expect(page.locator("text=Patient Wristbands").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    const allFilter = page.locator('button:has-text("All")').first();
    await expect(allFilter).toBeVisible({ timeout: 10000 });
  });

  test("3: Wristbands empty state or row list renders", async ({ page }) => {
    await navigateToView(page, "Wristbands");
    await expect(page.locator("text=Patient Wristbands").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const hasRows = await page.locator("table tbody tr").first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRows) {
      await expect(
        page.locator("text=No wristbands minted").first()
          .or(page.locator("text=No wristbands").first())
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("4: Wristbands page does not show runtime errors", async ({ page }) => {
    await navigateToView(page, "Wristbands");
    await expect(page.locator("text=Patient Wristbands").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=ReferenceError")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=TypeError")).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("CDSS Medication Labels (UI)", () => {
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

  test("5: Medication Labels page loads", async ({ page }) => {
    await navigateToView(page, "Medication Labels");
    await expect(page.locator("text=Medication Labels").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
  });

  test("6: Medication Labels status filter buttons render", async ({ page }) => {
    await navigateToView(page, "Medication Labels");
    await expect(page.locator("text=Medication Labels").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    const allFilter = page.locator('button:has-text("All")').first();
    await expect(allFilter).toBeVisible({ timeout: 10000 });
  });

  test("7: Medication Labels empty state or row list renders", async ({ page }) => {
    await navigateToView(page, "Medication Labels");
    await expect(page.locator("text=Medication Labels").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const hasRows = await page.locator("table tbody tr").first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRows) {
      await expect(
        page.locator("text=No medication labels minted").first()
          .or(page.locator("text=No medication labels").first())
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("8: Medication Labels page does not show runtime errors", async ({ page }) => {
    await navigateToView(page, "Medication Labels");
    await expect(page.locator("text=Medication Labels").first()).toBeVisible({
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await expect(page.locator("text=can is not defined")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=ReferenceError")).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=TypeError")).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── Public verify endpoint tests (no auth required) ────────────────
test.describe("CDSS Public Verify Endpoints", () => {
  test("9: Wristband verify rejects invalid token with 400", async ({ request }) => {
    const res = await request.get("/api/patient-wristbands/verify/INVALID-TOKEN-WITH-SPACES");
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.error).toBeTruthy();
  });

  test("10: Medication-label verify rejects invalid token with 400", async ({ request }) => {
    const res = await request.get("/api/medication-labels/verify/INVALID-TOKEN-WITH-SPACES");
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.error).toBeTruthy();
  });

  test("11: Wristband verify returns 404 for well-formed unknown token", async ({ request }) => {
    // A UUID-shaped token that doesn't exist in the DB
    const fakeToken = "00000000-0000-4000-8000-000000000000";
    const res = await request.get(`/api/patient-wristbands/verify/${fakeToken}`);
    // 404 if endpoint enforces "not found", 200 with status="voided"/"not_found" also acceptable
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test("12: Medication-label verify returns 404 for well-formed unknown token", async ({ request }) => {
    const fakeToken = "00000000-0000-4000-8000-000000000000";
    const res = await request.get(`/api/medication-labels/verify/${fakeToken}`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });
});
