import type { Page } from "@playwright/test";

/** Creates a role (if needed) and a person through the People page UI. */
export async function createPerson(page: Page, name: string, roleId: string): Promise<void> {
  await page.goto("/people");

  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Role id").fill(roleId);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Role", { exact: false }).selectOption(roleId);
  await page.getByRole("button", { name: "Save" }).click();
}

/** A random-ish suffix so specs never collide on ids across runs/retries. */
export function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
