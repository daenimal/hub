import { expect, test } from "@playwright/test";

test("login form never leaves the app (no open redirect)", async ({
  page,
}) => {
  await page.goto("/login?next=https://evil.example.com/phish");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill("user@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("wrong-password");
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

test("unauthenticated users cannot reach the account page", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "My Account" })).toHaveCount(
    0,
  );
  await expect(page).not.toHaveURL(/\/account\//);
});

test("register page renders the create account wording", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("forgot password page renders and links back to sign in", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" }),
  ).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("reset password page shows an invalid link state without a code", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Invalid or expired link" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
});

test("login form exposes the forgot password link", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
});

test("register form asks to confirm the password", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("At least 8 characters.")).toBeVisible();
});

test("password inputs can reveal and hide their text", async ({ page }) => {
  await page.goto("/login");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await passwordInput.fill("secret123");

  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(passwordInput).toHaveAttribute("type", "text");

  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(passwordInput).toHaveAttribute("type", "password");
});