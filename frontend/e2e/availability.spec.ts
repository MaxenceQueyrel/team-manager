import { expect, test } from "@playwright/test";
import { createPerson, uniqueSuffix } from "./helpers";

test("a newly created person shows up on the availability calendar", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Grace Hopper ${suffix}`;

  await createPerson(page, name, `availability-qa-${suffix}`);
  await expect(page.getByRole("cell", { name })).toBeVisible();

  await page.goto("/availability");

  await expect(page.getByText(name)).toBeVisible();
});
