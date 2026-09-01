import { expect, test } from "./fixtures";
import { createPerson, uniqueSuffix } from "./helpers";

test("assignment-driven reductions show up on the availability calendar", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Grace Hopper ${suffix}`;
  const projectName = `Scheduler ${suffix}`;

  await createPerson(page, name, `availability-qa-${suffix}`);

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: `View / assign ${projectName}`, exact: true }).click();
  await page.getByLabel("Person").selectOption({ label: name });
  await page.getByLabel("Commitment").selectOption("half-time");
  await page.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-01-10");
  await page.getByRole("button", { name: "Assign to project" }).click();

  await page.goto("/availability");
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-10");

  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByTitle("2026-01-01: 50%")).toBeVisible();
});
