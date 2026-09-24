import { expect, test } from "@playwright/test";

test("theme picker applies a theme and persists it", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");

  await page.getByRole("button", { name: "Switch theme" }).click();
  await page.getByRole("menuitemradio", { name: /violet/i }).click();

  await expect(html).toHaveAttribute("data-theme", "violet");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "violet");
});

test("theme picker defaults to onyx when nothing stored", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "onyx");
});