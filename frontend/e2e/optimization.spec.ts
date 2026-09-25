import { expect, test } from "./fixtures";
import { createPerson, uniqueSuffix } from "./helpers";

test("running an optimization for a project produces a result", async ({ page }) => {
  const name = `Optimization Smoke ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto("/optimization");
  await page.getByLabel("Project").selectOption({ label: name });
  await page.getByRole("button", { name: "Find optimal team" }).click();

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("Optimization score:")).toBeVisible();
});

test("alternative teams are collapsed by default and can be promoted", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Alternatives ${suffix}`;

  // A one-slot project needs three eligible people to yield the best team plus the
  // default two alternatives.
  for (const i of [1, 2, 3]) {
    await createPerson(page, `Candidate ${i} ${suffix}`, `candidate-${i}-${suffix}`);
  }

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ Add project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.goto("/optimization");
  await page.getByLabel("Project").selectOption({ label: projectName });
  await expect(page.getByLabel(/^Alternatives/)).toHaveValue("2");
  await page.getByRole("button", { name: "Find optimal team" }).click();

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  const alternativeHeadings = page.getByRole("heading", { name: /^Alternative \d+$/ });
  await expect(alternativeHeadings).toHaveCount(0);

  await page.getByRole("button", { name: "Show 2 alternative teams ▸" }).click();
  await expect(alternativeHeadings).toHaveCount(2);
  await expect(page.getByText(/vs best|same score as best/)).toHaveCount(2);

  await page.getByRole("button", { name: "Use this team" }).first().click();
  await expect(page.getByRole("button", { name: "Added to teams" })).toBeVisible();

  // The best team is saved by the solve itself, so promoting one alternative makes two.
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: projectName })).toHaveCount(2);
});
