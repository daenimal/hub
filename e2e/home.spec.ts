import { expect, test } from "@playwright/test";

test("homepage shows hero and tool cards", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toContainText("Micro utility");
  await expect(
    page.getByText("Ottimizzatore di Texture / Stile Retrò"),
  ).toBeVisible();
});

test("navigation to the texture optimizer tool works", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Texture Optimizer" }).click();
  await expect(page).toHaveURL(/\/tools\/texture-optimizer/);
  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toContainText("Ottimizzatore di Texture");
});

test("robots.txt disallows admin and login", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();
  const body = (await response.text()).toLowerCase();
  expect(body).toContain("disallow: /admin");
  expect(body).toContain("disallow: /login");
});