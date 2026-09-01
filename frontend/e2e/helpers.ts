import type { Page } from "@playwright/test";

/** Shared manager account, provisioned once by auth.setup.ts. */
export const MANAGER_EMAIL = "e2e-manager@example.com";
export const MANAGER_PASSWORD = "hunter2pass";

/** Logs in as the shared e2e manager account and waits for the redirect off /login. */
export async function loginAsManager(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(MANAGER_EMAIL);
  await page.getByLabel("Password").fill(MANAGER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Creates a role (if needed) and a person through the People page UI. */
export async function createPerson(page: Page, name: string, roleId: string): Promise<void> {
  await page.goto("/people");

  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Role id").fill(roleId);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Role", { exact: false }).selectOption(roleId);
  await page.getByRole("button", { name: "Save" }).click();
}

/** A random-ish suffix so specs never collide on ids across runs/retries. */
export function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
