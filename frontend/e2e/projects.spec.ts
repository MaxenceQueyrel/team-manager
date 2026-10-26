import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addSkillRequirement, createPerson, createProject, uniqueSuffix } from "./helpers";

const PROJECT_CSV_HEADER =
  "id,name,description,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases";

const quote = (value: unknown) => `"${JSON.stringify(value).replace(/"/g, '""')}"`;

function projectRow(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
}

test("creating a project adds it to the list", async ({ page }) => {
  const name = `Website Revamp ${uniqueSuffix()}`;

  await createProject(page, name);

  const row = projectRow(page, name);
  await expect(row).toContainText("0 / 1");
  await expect(row).toContainText("Nobody assigned");
  await expect(row).toContainText("Unstaffed");
});

test("the project form sums per-skill FTE and keeps max people in range", async ({ page }) => {
  const name = `Skill Split ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText("Add at least one skill requirement.");

  await addSkillRequirement(page, { id: "python", minLevel: 3, fte: 2 });
  const maxPeople = page.getByLabel("Max people", { exact: true });
  await expect(maxPeople.first()).toHaveValue("2");
  // Two FTE splits across two full-timers up to ten people at one day per week.
  await expect(maxPeople.first().locator("option")).toHaveText(
    Array.from({ length: 9 }, (_, i) => String(i + 2)),
  );
  await maxPeople.first().selectOption("4");
  await page.getByLabel("FTE", { exact: true }).first().selectOption("1.2");
  await expect(maxPeople.first()).toHaveValue("4");
  await page.getByLabel("FTE", { exact: true }).first().selectOption("0.4");
  await expect(maxPeople.first()).toHaveValue("2");
  await page.getByLabel("FTE", { exact: true }).first().selectOption("2");

  await addSkillRequirement(page, { id: "react", minLevel: 2, fte: 0.8 });
  await expect(maxPeople.last()).toHaveValue("1");
  await expect(page.getByText("Total 2.8 FTE")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(projectRow(page, name)).toContainText("0 / 2.8");
  await page.getByRole("link", { name }).click();
  const lane = page.getByRole("region", { name: "Staffing" });
  await expect(lane).toContainText("0 of 2.8 FTE");
  await expect(lane).toContainText("python ≥ 3 · 2 FTE");
  await expect(lane).toContainText("react ≥ 2 · 0.8 FTE");
});

test("assigning a person from the project workspace shows the roster entry", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Platform Rewrite ${suffix}`;
  const personName = `Katherine Johnson ${suffix}`;

  await createPerson(page, personName, `platform-${suffix}`);
  await createProject(page, projectName);

  await page.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const lane = page.getByRole("region", { name: "Staffing" });
  await lane.getByRole("button", { name: "Assign person to Whole project" }).click();
  await lane.getByLabel("Person").selectOption({ label: personName });
  // Allocations come in whole days per week only.
  await expect(lane.getByLabel("Commitment").locator("option")).toHaveText([
    "Full-time (5 days/week)",
    "4 days/week (80%)",
    "3 days/week (60%)",
    "2 days/week (40%)",
    "1 day/week (20%)",
  ]);
  await lane.getByLabel("Commitment").selectOption("0.6");
  await lane.getByLabel("Start date", { exact: true }).fill("2026-01-01");
  await lane.getByLabel("End date", { exact: true }).fill("2026-01-31");
  await lane.getByRole("button", { name: "Assign", exact: true }).click();

  const rosterEntry = lane.getByRole("listitem").filter({ hasText: personName });
  await expect(rosterEntry).toContainText("0.6 FTE");
  // Three days a week on a 1-FTE project leaves two days of it unstaffed.
  await expect(lane).toContainText("0.6 of 1 FTE");
  await expect(lane.getByText("0.4 FTE still open")).toBeVisible();
  await expect(lane.getByRole("listitem")).toHaveCount(1);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Projects" })
    .click();
  const row = projectRow(page, projectName);
  await expect(row).toContainText("0.6 / 1");
  await expect(row).toContainText(personName.split(" ")[0]);
  await expect(row).toContainText("Running");
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
      skill_requirements: [{ id: "general", min_level: 0, fte: 1 }],
      date_range: { start: "2026-01-01", end: "2026-01-31" },
    },
    {
      id: "build",
      skill_requirements: [{ id: "python", min_level: 3, fte: 2 }],
      date_range: { start: "2026-01-15", end: "2026-02-28" },
    },
  ];
  const csv = [
    PROJECT_CSV_HEADER,
    `${projectId},${projectName},,high,[],[],[],[],[],${quote(phases)}`,
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("link", { name: projectName }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));

  await expect(page.getByTitle("design: 2026-01-01 → 2026-01-31")).toContainText("0 / 1 FTE");
  await expect(page.getByTitle("build: 2026-01-15 → 2026-02-28")).toContainText("0 / 2 FTE");

  const design = page.getByRole("region", { name: "design" });
  await design.getByRole("button", { name: "Assign person to design" }).click();
  await design.getByLabel("Person").selectOption({ label: personName });
  await expect(design.getByLabel("Start date", { exact: true })).toHaveValue("2026-01-01");
  await expect(design.getByLabel("End date", { exact: true })).toHaveValue("2026-01-31");
  await design.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(design).toContainText("1 of 1 FTE");
  await expect(design.getByText("Fully staffed")).toBeVisible();
  await expect(page.getByTitle("design: 2026-01-01 → 2026-01-31")).toContainText("1 / 1 FTE");

  // Full-time on both overlapping phases exceeds 1.0 FTE; the error stays in the lane.
  const build = page.getByRole("region", { name: "build" });
  await build.getByRole("button", { name: "Assign person to build" }).click();
  await build.getByLabel("Person").selectOption({ label: personName });
  await build.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(build.getByRole("alert")).toContainText("exceed 1.0 FTE");

  await build.getByLabel("Start date", { exact: true }).fill("2026-02-01");
  await build.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(build).toContainText("1 of 2 FTE");
  await expect(build.getByText("Needs python ≥ 3")).toBeVisible();
  await expect(page.getByTitle("build: 2026-01-15 → 2026-02-28")).toContainText("1 / 2 FTE");
});

test("three people at 40% leave a 3-FTE project incomplete", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectId = `part-time-${suffix}`;
  const projectName = `Part-time Project ${suffix}`;
  const personNames = ["Ada", "Grace", "Hedy"].map((first) => `${first} ${suffix}`);
  for (const [i, personName] of personNames.entries()) {
    await createPerson(page, personName, `part-time-${i}-${suffix}`);
  }

  const requirements = [{ id: "general", min_level: 0, fte: 3 }];
  const csv = [
    PROJECT_CSV_HEADER,
    `${projectId},${projectName},,high,${quote(requirements)},[],[],[],[],[]`,
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const lane = page.getByRole("region", { name: "Staffing" });
  for (const personName of personNames) {
    await lane.getByRole("button", { name: "Assign person to Whole project" }).click();
    await lane.getByLabel("Person").selectOption({ label: personName });
    await lane.getByLabel("Commitment").selectOption("0.4");
    await lane.getByLabel("Start date", { exact: true }).fill("2026-01-01");
    await lane.getByLabel("End date", { exact: true }).fill("2026-01-31");
    await lane.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(lane.getByRole("listitem").filter({ hasText: personName })).toBeVisible();
  }

  await expect(lane).toContainText("1.2 of 3 FTE");
  await expect(lane.getByRole("listitem")).toHaveCount(3);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Projects" })
    .click();
  const row = projectRow(page, projectName);
  await expect(row).toContainText("1.2 / 3");
  await expect(row).toContainText("Running");
});

test("an unknown project id shows a not-found state", async ({ page }) => {
  await page.goto(`/projects/does-not-exist-${uniqueSuffix()}`);

  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await page.getByRole("link", { name: "← Back to Projects" }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("exporting projects downloads a CSV file", async ({ page }) => {
  const name = `Data Warehouse ${uniqueSuffix()}`;

  await createProject(page, name);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("projects.csv");
});

test("importing a CSV adds new projects and reports the result", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectId = `imported-${suffix}`;
  const name = `Imported Project ${suffix}`;

  await page.goto("/projects");

  const requirements = [{ id: "python", min_level: 3, fte: 2, max_people: 3 }];
  const csv = [
    PROJECT_CSV_HEADER,
    `${projectId},${name},Imported from CSV,high,${quote(requirements)},[],[],[],[],[]`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.getByText(/Import complete — created 1\./)).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
