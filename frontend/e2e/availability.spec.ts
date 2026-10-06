import { expect, test } from "./fixtures";
import { createPerson, uniqueSuffix } from "./helpers";

test("assignment-driven reductions show up on the capacity timeline", async ({ page }) => {
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

  await page.goto("/people");
  await page.getByRole("link", { name: "Capacity" }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("To", { exact: true }).fill("2026-01-10");

  await expect(page.getByTitle("2026-01-01: 50%")).toBeVisible();

  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/people\/[^/]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("the old availability route redirects to the capacity view", async ({ page }) => {
  await page.goto("/availability");

  await expect(page).toHaveURL(/\/people\/capacity$/);
  await expect(page.getByRole("link", { name: "People", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Availability" })).toHaveCount(0);
});

test("the capacity range is restored from the URL and survives switching tabs", async ({
  page,
}) => {
  await page.goto("/people/capacity?from=2026-10-01&to=2026-12-31");

  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-10-01");
  await expect(page.getByLabel("To", { exact: true })).toHaveValue("2026-12-31");

  await page.getByRole("link", { name: "Directory" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await page.getByRole("link", { name: "Capacity" }).click();

  await expect(page).toHaveURL(/\/people\/capacity\?from=2026-10-01&to=2026-12-31$/);
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-10-01");
});
