import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

test("running an optimization for a project produces a result", async ({ page }) => {
  const name = `Optimization Smoke ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto("/optimization");
  await page.getByLabel("Project").selectOption({ label: name });
  await page.getByRole("button", { name: "Find optimal team" }).click();

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("Optimization score:")).toBeVisible();
});
