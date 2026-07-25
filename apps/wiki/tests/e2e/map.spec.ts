import { test, expect } from "@playwright/test";

// The /map route is a desktop-only, full-bleed 3D viewer. With a wide viewport the
// viewer mounts (above the 1024px gate) and fetches the fixture manifest, populating
// the searchable location picker. Real location GLBs are supplied out-of-band, so this
// smoke asserts the shell + picker, not a 3D load.
test.describe("3D map", () => {
  test("mounts on a wide viewport and the location picker opens with the fixture", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/map");

    // ToolNavBrand renders the page title; unique on this full-bleed page.
    await expect(page.getByText("3D Map")).toBeVisible();

    // The searchable picker (#locinput) opens on focus; the manifest fetch fills the
    // list (#loclist .locrow) — the fixture ships exactly one location, "Test POI".
    const input = page.locator("#locinput");
    await expect(input).toBeVisible();
    await input.click();
    const rows = page.locator("#loclist .locrow");
    await expect(rows).toHaveCount(1, { timeout: 15000 });
    await expect(rows.first()).toContainText("Test POI");
  });

  test("shows the desktop-only gate on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: /Bigger screen needed/i })).toBeVisible();
  });
});
