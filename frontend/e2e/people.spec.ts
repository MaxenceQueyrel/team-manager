import { expect, test } from "./fixtures";
import { createPerson, uniqueSuffix } from "./helpers";

test("creating a person adds them to the roster", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Ada Lovelace ${suffix}`;

  await createPerson(page, name, `qa-engineer-${suffix}`);

  await expect(page.getByRole("cell", { name })).toBeVisible();
});

test("exporting people downloads a CSV file", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Grace Hopper ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("people.csv");
});

test("importing a CSV adds new people and reports the result", async ({ page }) => {
  const suffix = uniqueSuffix();
  const roleId = `qa-engineer-${suffix}`;
  const personId = `imported-${suffix}`;
  const name = `Imported Person ${suffix}`;

  await page.goto("/people");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Role id").fill(roleId);
  await page.getByRole("button", { name: "Save" }).click();

  const csv = [
    "id,name,role,seniority,years_of_experience,fte_capacity,manager_id,skills,availability_windows,preferences,growth_targets,affinities",
    `${personId},${name},${roleId},mid,3,1,,[],[],[],[],{}`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText(/Import complete — created 1, skipped 0/)).toBeVisible();
  await expect(page.getByRole("cell", { name })).toBeVisible();
});

test("importing a CSV with unknown roles/skills adds them to the catalog", async ({ page }) => {
  const suffix = uniqueSuffix();
  const roleId = `new-role-${suffix}`;
  const skillId = `new-skill-${suffix}`;
  const personId = `imported-${suffix}`;
  const name = `Catalog Import ${suffix}`;

  await page.goto("/people");

  const csv = [
    "id,name,role,seniority,years_of_experience,fte_capacity,manager_id,skills,availability_windows,preferences,growth_targets,affinities",
    `${personId},${name},${roleId},mid,3,1,,"[{""id"": ""${skillId}"", ""level"": 3}]",[],[],[],{}`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Neither role nor skill existed beforehand, so the import must have created both
  // catalog entries on the fly instead of failing with "Unknown role".
  await expect(
    page.getByText(/Also added 1 new role and 1 new skill to the catalog\./),
  ).toBeVisible();
  const row = page.getByRole("row", { name });
  await expect(row.getByRole("cell", { name: roleId })).toBeVisible();
  await expect(row.getByText(`${skillId} (3)`)).toBeVisible();
});
