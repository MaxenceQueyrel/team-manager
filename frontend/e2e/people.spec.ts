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
    "id,name,role,seniority,years_of_experience,working_days_per_week,manager_id,skills,vacations,availability_windows,preferences,growth_targets,affinities",
    `${personId},${name},${roleId},mid,3,5,,[],[],[],[],[],{}`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText(/Import complete — created 1\./)).toBeVisible();
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
    "id,name,role,seniority,years_of_experience,working_days_per_week,manager_id,skills,vacations,availability_windows,preferences,growth_targets,affinities",
    `${personId},${name},${roleId},mid,3,5,,"[{""id"": ""${skillId}"", ""level"": 3}]",[],[],[],[],{}`,
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

test("editing an availability window on the detail page updates the timeline", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Katherine Johnson ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/people\/[^/]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-10");
  await expect(page.getByTitle("2026-01-04: 100%")).toBeVisible();

  await page.getByRole("button", { name: "+ Add window" }).click();
  await page.getByLabel("Window start").fill("2026-01-03");
  await page.getByLabel("Window end").fill("2026-01-05");
  await page.getByLabel("Window ratio").fill("0.25");
  await page.getByRole("button", { name: "Save windows" }).click();

  await expect(page.getByTitle("2026-01-04: 25%")).toBeVisible();
  await expect(page.getByTitle("2026-01-06: 100%")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/people$/);
});

test("working days per week derives the FTE shown on the roster and detail page", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const name = `Hedy Lamarr ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  const row = page.getByRole("row", { name });
  const fteCell = row.getByRole("cell").nth(4);
  await expect(fteCell).toHaveText("100%");

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Working days per week").selectOption("4");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(fteCell).toHaveText("80%");
  await page.getByRole("link", { name }).click();
  await expect(page.getByText("4 days/week · 80% FTE")).toBeVisible();
});

test("marking vacation days on the detail page zeroes them on the timeline", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Mary Jackson ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  await page.getByRole("link", { name }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-10");
  await expect(page.getByTitle("2026-01-06: 100%")).toBeVisible();

  await page.getByLabel("Vacation month").fill("2026-01");
  await page.getByRole("button", { name: "2026-01-05", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-01-07", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("2026-01-05 → 2026-01-07 (3 days)")).toBeVisible();
  await page.getByRole("button", { name: "Save vacation" }).click();

  await expect(page.getByTitle("2026-01-06: 0%")).toBeVisible();
  await expect(page.getByTitle("2026-01-08: 100%")).toBeVisible();

  await page.reload();
  await page.getByLabel("Vacation month").fill("2026-01");
  await expect(page.getByRole("button", { name: "2026-01-06", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("an assigned person shows reduced availability on their detail page", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Dorothy Vaughan ${suffix}`;
  const projectName = `Fortran ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: projectName }).click();
  await page.getByRole("button", { name: "Assign person to Whole project" }).click();
  await page.getByLabel("Person").selectOption({ label: name });
  await page.getByLabel("Commitment").selectOption("half-time");
  await page.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-01-10");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("0.5 / 1 FTE · partial")).toBeVisible();

  await page.goto("/people");
  await page.getByRole("link", { name }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-10");
  await expect(page.getByTitle("2026-01-01: 50%")).toBeVisible();

  await page.getByText("Past assignments (1)").click();
  await page.getByRole("link", { name: projectName }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
});

test("an unknown person id shows a not-found state", async ({ page }) => {
  await page.goto(`/people/does-not-exist-${uniqueSuffix()}`);

  await expect(page.getByRole("heading", { name: "Person not found" })).toBeVisible();
  await page.getByRole("link", { name: "← Back to People" }).click();
  await expect(page).toHaveURL(/\/people$/);
});
