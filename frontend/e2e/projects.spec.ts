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

test("assigning a person from the project workspace shows the roster entry", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Platform Rewrite ${suffix}`;
  const personName = `Katherine Johnson ${suffix}`;

  await createPerson(page, personName, `platform-${suffix}`);

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const lane = page.getByRole("region", { name: "Whole project" });
  await lane.getByRole("button", { name: "Assign person to Whole project" }).click();
  await lane.getByLabel("Person").selectOption({ label: personName });
  await lane.getByLabel("Commitment").selectOption("half-time");
  await lane.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await lane.getByLabel("End date", { exact: true }).fill("2026-01-31");
  await lane.getByRole("button", { name: "Assign", exact: true }).click();

  const rosterEntry = lane.getByRole("listitem").filter({ hasText: personName });
  await expect(rosterEntry).toContainText("Half-time");
  await expect(lane.getByText("1 / 1 · complete")).toBeVisible();

  await page.getByRole("link", { name: "← Projects" }).click();
  await expect(page.getByRole("link", { name: projectName })).toContainText("1 / 1 slots");
});

test("assigning to a phase uses the phase dates and updates its fill", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectId = `phased-${suffix}`;
  const projectName = `Phased Project ${suffix}`;
  const personName = `Mary Jackson ${suffix}`;
  await createPerson(page, personName, `phased-${suffix}`);

  // Overlapping phases: build starts before design ends.
  const phases = [
    {
      id: "design",
      n_slots: 1,
      skill_requirements: [],
      date_range: { start: "2026-01-01", end: "2026-01-31" },
    },
    {
      id: "build",
      n_slots: 2,
      skill_requirements: [{ id: "python", min_level: 3 }],
      date_range: { start: "2026-01-15", end: "2026-02-28" },
    },
  ];
  const csv = [
    "id,name,description,n_slots,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases",
    `${projectId},${projectName},,1,high,[],[],[],[],[],"${JSON.stringify(phases).replace(/"/g, '""')}"`,
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("link", { name: projectName }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));

  await expect(page.getByTitle("design: 2026-01-01 → 2026-01-31")).toContainText("0 / 1");
  await expect(page.getByTitle("build: 2026-01-15 → 2026-02-28")).toContainText("0 / 2");

  const design = page.getByRole("region", { name: "design" });
  await design.getByRole("button", { name: "Assign person to design" }).click();
  await design.getByLabel("Person").selectOption({ label: personName });
  await expect(design.getByLabel("Start date", { exact: true })).toHaveValue("2026-01-01");
  await expect(design.getByLabel("End date", { exact: true })).toHaveValue("2026-01-31");
  await design.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(design.getByText("1 / 1 · complete")).toBeVisible();
  await expect(page.getByTitle("design: 2026-01-01 → 2026-01-31")).toContainText("1 / 1");

  // Full-time on both overlapping phases exceeds 1.0 FTE; the error stays in the lane.
  const build = page.getByRole("region", { name: "build" });
  await build.getByRole("button", { name: "Assign person to build" }).click();
  await build.getByLabel("Person").selectOption({ label: personName });
  await build.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(build.getByRole("alert")).toContainText("exceed 1.0 FTE");

  await build.getByLabel("Start date", { exact: true }).fill("2026-02-01");
  await build.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(build.getByText("1 / 2 · partial")).toBeVisible();
  await expect(build.getByText("Missing skills: python ≥ 3")).toBeVisible();
  await expect(page.getByTitle("build: 2026-01-15 → 2026-02-28")).toContainText("1 / 2");
});

test("an unknown project id shows a not-found state", async ({ page }) => {
  await page.goto(`/projects/does-not-exist-${uniqueSuffix()}`);

  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await page.getByRole("link", { name: "← Back to Projects" }).click();
  await expect(page).toHaveURL(/\/projects$/);
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
