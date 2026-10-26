import { expect, test } from "./fixtures";
import { createPerson, createProject, uniqueSuffix } from "./helpers";

test("assigning a person to a project from their page lists the assignment", async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `Margaret Hamilton ${suffix}`;
  const projectName = `Apollo ${suffix}`;
  await createPerson(page, name, `qa-engineer-${suffix}`);

  await createProject(page, projectName);

  await page.goto("/people");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(name);
  const assignments = page.getByRole("region", { name: "Assignments" });
  await expect(assignments.getByText("Not on any project right now")).toBeVisible();

  await page.getByRole("button", { name: "Assign to project" }).first().click();
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption({ label: projectName });
  await page.getByLabel("Commitment").selectOption("0.6");
  await page.getByLabel("Start date", { exact: true }).fill("2030-01-07");
  await page.getByLabel("End date", { exact: true }).fill("2030-02-03");
  await page.getByRole("button", { name: "Assign", exact: true }).click();

  const row = assignments.getByRole("link", { name: projectName });
  await expect(row).toContainText("7 Jan 2030 → 3 Feb 2030 · 4 weeks");
  await expect(row).toContainText("3 days/week");
  await expect(assignments.getByText("Not on any project right now")).toHaveCount(0);
});
