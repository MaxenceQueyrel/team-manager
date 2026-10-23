import { expect, type Page, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

const PASSWORD = "hunter2pass";

async function registerAndLogin(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<void> {
  await request.post("/api/v1/auth/register", { data: { email, password: PASSWORD } });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Scoped to the sidebar: the danger zone's "Delete {name}…" button also contains the name.
function switcher(page: Page, orgName: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: orgName });
}

async function createOrganization(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New organization" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
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
  await createOrganization(page, orgName);
  await expect(page.getByText("Organization settings · you're the owner")).toBeVisible();

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

  await createOrganization(page, orgOneName);
  await createOrganization(page, orgTwoName);

  await switcher(page, orgTwoName).click();
  await page.getByRole("menuitemradio", { name: orgOneName }).click();
  await expect(page.getByRole("heading", { level: 1, name: orgOneName })).toBeVisible();
});

test("an organization owner can add and remove a member", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const memberEmail = `e2e-member-${suffix}@example.com`;
  await request.post("/api/v1/auth/register", { data: { email: memberEmail, password: PASSWORD } });
  await registerAndLogin(page, request, `e2e-owner-${suffix}@example.com`);
  await page.waitForURL("/organization");

  const orgName = `Acme ${suffix}`;
  await createOrganization(page, orgName);
  const orgSwitcher = switcher(page, orgName);
  await expect(orgSwitcher).toContainText("1 member");

  await page.getByLabel("Invite by email").fill(`nobody-${suffix}@example.com`);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("User not found")).toBeVisible();

  await page.getByLabel("Invite by email").fill(memberEmail);
  await page.getByLabel("Role").selectOption({ label: "Owner" });
  await page.getByRole("button", { name: "Send invite" }).click();

  const memberRow = page.getByRole("listitem").filter({ hasText: memberEmail });
  await expect(memberRow).toBeVisible();
  await expect(memberRow.getByText("Owner")).toBeVisible();
  await expect(orgSwitcher).toContainText("2 members");

  page.on("dialog", (dialog) => dialog.accept());
  await memberRow.getByRole("button", { name: `Remove ${memberEmail}` }).click();
  await expect(memberRow).toBeHidden();
  await expect(orgSwitcher).toContainText("1 member");
});

test("an owner can rename the organization", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  await registerAndLogin(page, request, `e2e-rename-${suffix}@example.com`);
  await page.waitForURL("/organization");

  await createOrganization(page, `Before ${suffix}`);

  const nameInput = page.getByLabel("Organization name");
  const save = page.getByRole("button", { name: "Save" });
  await nameInput.fill("   ");
  await expect(page.getByText("The organization name can't be empty.")).toBeVisible();
  await expect(save).toBeDisabled();

  const renamed = `After ${suffix}`;
  await nameInput.fill(renamed);
  await save.click();
  await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
  await expect(switcher(page, renamed)).toBeVisible();
});

test("deleting the organization switches to the remaining one, then to the empty state", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  await registerAndLogin(page, request, `e2e-delete-${suffix}@example.com`);
  await page.waitForURL("/organization");

  const keptName = `Kept ${suffix}`;
  const doomedName = `Doomed ${suffix}`;
  await createOrganization(page, keptName);
  await createOrganization(page, doomedName);

  await page.getByRole("button", { name: `Delete ${doomedName}…` }).click();
  const confirmDelete = page.getByRole("button", { name: "Delete organization" });
  await expect(confirmDelete).toBeDisabled();
  await page.getByLabel(`Type ${doomedName} to confirm`).fill(doomedName);
  await confirmDelete.click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(switcher(page, keptName)).toBeVisible();

  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await page.getByRole("button", { name: `Delete ${keptName}…` }).click();
  await page.getByLabel(`Type ${keptName} to confirm`).fill(keptName);
  await page.getByRole("button", { name: "Delete organization" }).click();

  await expect(page.getByText("You don't belong to an organization yet.")).toBeVisible();
});
