import { expect, test } from "@playwright/test";

test("login form never leaves the app (no open redirect)", async ({
  page,
}) => {
  await page.goto("/login?next=https://evil.example.com/phish");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("unauthenticated users cannot reach the admin dashboard", async ({
  page,
}) => {
  await page.goto("/admin/dashboard");
  await expect(page.getByText("Dashboard Admin")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/admin\//);
});