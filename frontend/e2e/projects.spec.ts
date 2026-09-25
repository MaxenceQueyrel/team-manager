import { expect, test } from "./fixtures";
import { createPerson, uniqueSuffix } from "./helpers";

test("creating a project adds it to the list", async ({ page }) => {
  const name = `Website Revamp ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("assigning a person to a project shows the roster entry", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Platform Rewrite ${suffix}`;
  const personName = `Katherine Johnson ${suffix}`;

  await createPerson(page, personName, `platform-${suffix}`);

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: `View / assign ${projectName}`, exact: true }).click();
  await page.getByLabel("Person").selectOption({ label: personName });
  await page.getByLabel("Commitment").selectOption("half-time");
  await page.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-01-31");
  await page.getByRole("button", { name: "Assign to project" }).click();

  const rosterEntry = page.getByRole("listitem").filter({ hasText: personName });
  await expect(rosterEntry).toBeVisible();
  await expect(rosterEntry).toContainText("Half-time");
});

test("exporting projects downloads a CSV file", async ({ page }) => {
  const name = `Data Warehouse ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("projects.csv");
});

test("importing a CSV adds new projects and reports the result", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectId = `imported-${suffix}`;
  const name = `Imported Project ${suffix}`;

  await page.goto("/projects");

  const csv = [
    "id,name,description,n_slots,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases",
    `${projectId},${name},Imported from CSV,2,high,[],[],[],[],[],[]`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText(/Import complete — created 1\./)).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
