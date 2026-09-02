import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

// Uses fresh throwaway accounts (not the shared manager fixture) since these tests
// change a password and delete an account.

test("viewing the profile page shows account info and lets a user change their password", async ({
  page,
  request,
}) => {
  const email = `e2e-profile-${uniqueSuffix()}@example.com`;
  const password = "hunter2pass";
  const newPassword = "hunter2pass-new";

  const registerResponse = await request.post("/api/v1/auth/register", {
    data: { email, password },
  });
  expect(registerResponse.ok()).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");

  await page.getByText(email).click();
  await page.waitForURL("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("employee")).toBeVisible();
  await expect(page.getByText("Not a manager")).toBeVisible();

  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
});

test("deleting the account signs the user out and revokes their credentials", async ({
  page,
  request,
}) => {
  const email = `e2e-profile-delete-${uniqueSuffix()}@example.com`;
  const password = "hunter2pass";

  const registerResponse = await request.post("/api/v1/auth/register", {
    data: { email, password },
  });
  expect(registerResponse.ok()).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");

  await page.getByText(email).click();
  await page.waitForURL("/profile");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL("/login");

  const loginResponse = await request.post("/api/v1/auth/login", {
    data: { email, password },
  });
  expect(loginResponse.status()).toBe(401);
});
