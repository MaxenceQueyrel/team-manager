import { expect, type Locator, type Page } from "@playwright/test";

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

  await page.getByRole("button", { name: "Add role", exact: true }).click();
  await page.getByLabel("Role id").fill(roleId);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: /^Role/ }).selectOption(roleId);
  await page.getByRole("button", { name: "Save" }).click();
}

/** A random-ish suffix so specs never collide on ids across runs/retries. */
export function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Adds a skill requirement row to the open project form; a min level of 0 lets anyone fill it. */
export async function addSkillRequirement(
  page: Page,
  { id, minLevel = 0, fte = 1 }: { id: string; minLevel?: number; fte?: number },
): Promise<void> {
  // With no rows yet the button is the form field's first control, so it takes the field's label.
  await page.getByRole("button").filter({ hasText: "+ Add requirement" }).click();
  await page.getByPlaceholder("skill id").last().fill(id);
  // Clicking outside the skill combobox closes its suggestion list.
  const level = page.getByLabel("Minimum level", { exact: true }).last();
  await level.click();
  await level.fill(String(minLevel));
  await page.getByLabel("FTE", { exact: true }).last().selectOption(String(fte));
}

/** Creates a 1-FTE project anyone can staff through the Projects page form. */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await addSkillRequirement(page, { id: "general" });
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("heading", { name }).waitFor();
}

/** The overview's "Needs your attention" row containing `text`, expanding the list if it is
 * capped. */
export async function attentionRow(page: Page, text: string): Promise<Locator> {
  const attention = page.getByRole("region", { name: "Needs your attention" });
  const row = attention.getByRole("listitem").filter({ hasText: text });
  // The shared manager org collects projects from every spec, so the list is usually capped,
  // and the cap can kick in only once the store and assignments have both loaded.
  await expect(async () => {
    const showAll = attention.getByRole("button", { name: /^Show all/ });
    if ((await showAll.count()) > 0) await showAll.click();
    await expect(row).toBeVisible({ timeout: 1000 });
  }).toPass();
  return row;
}
