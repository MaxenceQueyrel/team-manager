import { expect, test } from "./fixtures";
import { addSkillRequirement, attentionRow, uniqueSuffix } from "./helpers";

test("a project created from the overview shows up as unstaffed", async ({ page }) => {
  const name = `Nova Redesign ${uniqueSuffix()}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await addSkillRequirement(page, { id: "general" });
  await page.getByRole("button", { name: "Save" }).click();

  const row = await attentionRow(page, `${name} has nobody assigned`);
  await expect(row).toContainText("0 / 1 FTE staffed · no dates set");
  await row.getByRole("link", { name: "Staff it" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

test("a project whose dates are past but is not complete asks for a review", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectId = `atlas-${suffix}`;
  const projectName = `Atlas Migration ${suffix}`;
  const requirements = JSON.stringify([{ id: "general", min_level: 0, fte: 1 }]);
  const dateRanges = JSON.stringify([{ start: "2025-07-01", end: "2025-09-30" }]);
  const csv = [
    "id,name,description,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases",
    `${projectId},${projectName},,high,"${requirements.replace(/"/g, '""')}",[],[],[],"${dateRanges.replace(/"/g, '""')}",[]`,
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByRole("link", { name: projectName })).toBeVisible();

  await page.goto("/");
  const row = await attentionRow(page, `${projectName} ended on 30 Sep 2025, still open`);
  await expect(row).toContainText("Finished at 0 / 1 FTE. Close it or extend the dates");
  await row.getByRole("link", { name: "Review" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
});
