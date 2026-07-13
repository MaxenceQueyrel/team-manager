import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

test("creating a project adds it to the list", async ({ page }) => {
  const name = `Website Revamp ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
});
