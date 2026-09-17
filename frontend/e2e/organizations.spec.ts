import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

const PASSWORD = "hunter2pass";

async function registerAndLogin(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<void> {
  await request.post("/api/v1/auth/register", { data: { email, password: PASSWORD } });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a fresh user sees the organization empty state and can create one", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  await registerAndLogin(page, request, `e2e-neworg-${suffix}@example.com`);
  await page.waitForURL("/organization");
  await expect(page.getByText("You don't belong to an organization yet.")).toBeVisible();

  const orgName = `Fresh Start ${suffix}`;
  await page.getByLabel("Name", { exact: true }).fill(orgName);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Members — ${orgName}` })).toBeVisible();

  // The new organization becomes active immediately, lifting the empty-state redirect.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("a user can create multiple organizations and switch between them", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  await registerAndLogin(page, request, `e2e-switch-${suffix}@example.com`);
  await page.waitForURL("/organization");

  const orgOneName = `Org One ${suffix}`;
  const orgTwoName = `Org Two ${suffix}`;

  await page.getByLabel("Name", { exact: true }).fill(orgOneName);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Members — ${orgOneName}` })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill(orgTwoName);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Members — ${orgTwoName}` })).toBeVisible();

  await page.getByLabel("Organization").selectOption({ label: orgOneName });
  await expect(page.getByRole("heading", { name: `Members — ${orgOneName}` })).toBeVisible();
});

test("an organization owner can add and remove a member", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const memberEmail = `e2e-member-${suffix}@example.com`;
  await request.post("/api/v1/auth/register", { data: { email: memberEmail, password: PASSWORD } });
  await registerAndLogin(page, request, `e2e-owner-${suffix}@example.com`);
  await page.waitForURL("/organization");

  const orgName = `Acme ${suffix}`;
  await page.getByLabel("Name", { exact: true }).fill(orgName);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: `Members — ${orgName}` })).toBeVisible();

  await page.getByLabel("Add member by email").fill(memberEmail);
  await page.getByRole("button", { name: "Add member" }).click();

  const memberRow = page.getByRole("listitem").filter({ hasText: memberEmail });
  await expect(memberRow).toBeVisible();
  await expect(memberRow.getByText("contributor")).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await memberRow.getByRole("button", { name: `Remove ${memberEmail}` }).click();
  await expect(memberRow).toBeHidden();
});
