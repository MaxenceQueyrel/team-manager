import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

test("logging in lands on a protected route", async ({ page, request }) => {
  const email = `e2e-login-${uniqueSuffix()}@example.com`;
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
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("an unauthenticated visit to a protected route redirects to /login", async ({ page }) => {
  await page.goto("/people");

  await page.waitForURL("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
