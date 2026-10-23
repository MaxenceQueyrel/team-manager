import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createPerson, MANAGER_EMAIL, MANAGER_PASSWORD, uniqueSuffix } from "./helpers";

const PROJECT_CSV_HEADER =
  "id,name,description,n_slots,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases";

const PEOPLE_CSV_HEADER =
  "id,name,role,seniority,years_of_experience,working_days_per_week,manager_id,skills,vacations,availability_windows,preferences,growth_targets,affinities";

const quote = (value: unknown) => `"${JSON.stringify(value).replace(/"/g, '""')}"`;

/** Imports full-time mid-level people through the People page CSV upload. */
async function importPeople(
  page: Page,
  people: { id: string; name: string; skills?: { id: string; level: number }[] }[],
): Promise<void> {
  const rows = people.map(
    ({ id, name, skills = [] }) => `${id},${name},${id},mid,3,5,,${quote(skills)},[],[],[],[],{}`,
  );
  await page.goto("/people");
  await page.locator('input[type="file"]').setInputFiles({
    name: "people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([PEOPLE_CSV_HEADER, ...rows].join("\n")),
  });
  await expect(page.getByText(`Import complete — created ${people.length}.`)).toBeVisible();
}

/** Ids of everyone in the organization except `keepIds`, read from the People page's own fetch. */
async function everyoneElse(page: Page, keepIds: string[]): Promise<string[]> {
  const response = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/v1/people/",
  );
  await page.goto("/people");
  const people: { id: string }[] = await (await response).json();
  return people.map((p) => p.id).filter((id) => !keepIds.includes(id));
}

/** Imports a non-phased project spanning January 2027 (one slot by default), then opens its workspace. */
async function importDatedProject(
  page: Page,
  {
    id,
    name,
    nSlots = 1,
    skillRequirements = [],
    excludedPersonIds = [],
    includedPersonIds = [],
    squads = [],
  }: {
    id: string;
    name: string;
    nSlots?: number;
    skillRequirements?: { id: string; min_level: number }[];
    excludedPersonIds?: string[];
    includedPersonIds?: string[];
    squads?: { member_ids: string[] }[];
  },
): Promise<void> {
  const dateRanges = [{ start: "2027-01-01", end: "2027-01-31" }];
  const csv = [
    PROJECT_CSV_HEADER,
    `${id},${name},,${nSlots},high,${quote(skillRequirements)},${quote(excludedPersonIds)},${quote(includedPersonIds)},${quote(squads)},${quote(dateRanges)},[]`,
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function runOptimization(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Optimize staffing" }).click();
  const panel = page.getByRole("complementary", { name: "Optimize staffing" });
  await panel.getByRole("button", { name: "Find optimal team" }).click();
  await expect(page.getByRole("heading", { name: "Optimization result" })).toBeVisible();
}

test("optimizing from the project workspace shows the best team", async ({ page }) => {
  const name = `Optimization Smoke ${uniqueSuffix()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name }).click();

  await runOptimization(page);
  await expect(
    page.getByRole("region", { name: "Best team" }).getByText("Optimization score:"),
  ).toBeVisible();
});

test("alternative teams are collapsed by default and show their delta vs best", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Alternatives ${suffix}`;

  // A one-slot project needs three eligible people to yield the best team plus the
  // default two alternatives.
  for (const i of [1, 2, 3]) {
    await createPerson(page, `Candidate ${i} ${suffix}`, `candidate-${i}-${suffix}`);
  }
  await importDatedProject(page, { id: `alternatives-${suffix}`, name: projectName });

  await page.getByRole("button", { name: "Optimize staffing" }).click();
  const panel = page.getByRole("complementary", { name: "Optimize staffing" });
  await expect(panel.getByLabel(/^Alternatives/)).toHaveValue("2");
  await panel.getByRole("button", { name: "Find optimal team" }).click();

  await expect(page.getByRole("heading", { name: "Optimization result" })).toBeVisible();
  const alternativeHeadings = page.getByRole("heading", { name: /^Alternative \d+$/ });
  await expect(alternativeHeadings).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Best team" }).getByText("All requirements covered"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Show 2 alternative teams ▸" }).click();
  await expect(alternativeHeadings).toHaveCount(2);
  await expect(page.getByText(/vs best|same score as best/)).toHaveCount(2);
});

test("applying proposals replaces the project's staffing", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Apply ${suffix}`;
  for (const i of [1, 2, 3]) {
    await createPerson(page, `Applicant ${i} ${suffix}`, `applicant-${i}-${suffix}`);
  }
  await importDatedProject(page, { id: `apply-${suffix}`, name: projectName });
  const lane = page.getByRole("region", { name: "Whole project" });
  await expect(lane.getByText("0 / 1 FTE · empty")).toBeVisible();

  await runOptimization(page);
  const best = page.getByRole("region", { name: "Best team" });
  await expect(best.getByText("added", { exact: true })).toHaveCount(1);

  await best.getByRole("button", { name: "Apply to project" }).click();
  await expect(
    page.getByText("This replaces current staffing for the whole project."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(lane.getByText("1 / 1 FTE · complete")).toBeVisible();
  await expect(best.getByText("added", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show 2 alternative teams ▸" }).click();
  const alternative = page.getByRole("region", { name: "Alternative 1" });
  await expect(alternative.getByText("added", { exact: true })).toHaveCount(1);
  await expect(alternative.getByText("dropped", { exact: true })).toHaveCount(1);

  await alternative.getByRole("button", { name: "Apply to project" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(alternative.getByText("added", { exact: true })).toHaveCount(0);
  await expect(lane.getByRole("listitem")).toHaveCount(1);

  // The solve saves the best team; applying the alternative saves it too.
  await page.getByRole("button", { name: "Proposals (2) ▸" }).click();
  await expect(page.getByRole("heading", { name: /^Proposal \d+$/ })).toHaveCount(2);
});

test("applying a stale proposal reports the FTE conflict by name", async ({ page }) => {
  const suffix = uniqueSuffix();
  const personId = `busy-${suffix}`;
  const personName = `Busy Person ${suffix}`;
  await importPeople(page, [{ id: personId, name: personName }]);

  // Forcing the person in makes them the proposal; staffing them full-time elsewhere
  // afterwards makes that saved proposal conflict.
  const proposedName = `Conflict Proposed ${suffix}`;
  await importDatedProject(page, {
    id: `conflict-proposed-${suffix}`,
    name: proposedName,
    includedPersonIds: [personId],
  });
  await runOptimization(page);

  await importDatedProject(page, {
    id: `conflict-other-${suffix}`,
    name: `Conflict Other ${suffix}`,
  });
  const lane = page.getByRole("region", { name: "Whole project" });
  await lane.getByRole("button", { name: "Assign person to Whole project" }).click();
  await lane.getByLabel("Person").selectOption({ label: personName });
  await lane.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(lane.getByText("1 / 1 FTE · complete")).toBeVisible();

  await page.goto(`/projects/conflict-proposed-${suffix}`);
  await page.getByRole("button", { name: "Proposals (1) ▸" }).click();
  await page
    .getByRole("region", { name: "Proposal 1" })
    .getByRole("button", { name: "Apply to project" })
    .click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(`exceed 1.0 FTE for: ${personName}`);
});

test("an infeasible squad is explained in the optimization panel", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Infeasible ${suffix}`;
  // Every selected person carries at least 0.1 FTE, so eleven people co-selected as a
  // squad can never fit a one-FTE project once nobody else can be picked instead.
  const members = Array.from({ length: 11 }, (_, i) => ({
    id: `squad-${i + 1}-${suffix}`,
    name: `Squad Member ${i + 1} ${suffix}`,
  }));
  const memberIds = members.map((m) => m.id);
  await importPeople(page, members);
  await importDatedProject(page, {
    id: `infeasible-${suffix}`,
    name: projectName,
    excludedPersonIds: await everyoneElse(page, memberIds),
    squads: [{ member_ids: memberIds }],
  });

  await page.getByRole("button", { name: "Optimize staffing" }).click();
  const panel = page.getByRole("complementary", { name: "Optimize staffing" });
  await panel.getByRole("button", { name: "Find optimal team" }).click();

  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("No feasible team for these constraints");
  await expect(alert).toContainText(
    `Squad of Squad Member 1 ${suffix}, Squad Member 2 ${suffix}, Squad Member 3 ${suffix} and 8 more (11 people) must be staffed together at 0.1 FTE or more each, which doesn't fit the 1 FTE the project needs.`,
  );
  await expect(alert).toContainText("Drop or shrink the squad, or raise the required FTE.");
  await expect(alert).not.toContainText("status code 409");
  await expect(page.getByRole("heading", { name: "Optimization result" })).toHaveCount(0);
});

test("a partially covered proposal breaks down its unmet requirements", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Partial ${suffix}`;
  const skillId = `rare-skill-${suffix}`;
  const noviceId = `novice-${suffix}`;
  await importPeople(page, [
    { id: noviceId, name: `Novice ${suffix}`, skills: [{ id: skillId, level: 2 }] },
  ]);
  // A single full-time candidate can staff only half of two FTE.
  await importDatedProject(page, {
    id: `partial-${suffix}`,
    name: projectName,
    nSlots: 2,
    skillRequirements: [{ id: skillId, min_level: 4 }],
    excludedPersonIds: await everyoneElse(page, [noviceId]),
  });

  await page.getByRole("button", { name: "Optimize staffing" }).click();
  const panel = page.getByRole("complementary", { name: "Optimize staffing" });
  await panel.getByLabel(/^Alternatives/).selectOption("0");
  await panel.getByRole("button", { name: "Find optimal team" }).click();
  await expect(page.getByRole("heading", { name: "Optimization result" })).toBeVisible();

  const best = page.getByRole("region", { name: "Best team" });
  await expect(best.getByText("2 unmet requirements")).toBeVisible();
  const coverage = best.getByRole("table", { name: "Coverage of Whole project" });
  const fteRow = coverage.getByRole("row", { name: /^FTE/ });
  await expect(fteRow).toContainText("1 / 2 FTE staffed");
  await expect(fteRow).toContainText(
    "Only 1 FTE is available from eligible people — add candidates or reduce the required FTE.",
  );
  const skillRow = coverage.getByRole("row", { name: new RegExp(`^${skillId}`) });
  await expect(skillRow).toContainText("Level 2 / 4 · not covered");
  await expect(skillRow).toContainText(`Add a candidate with ${skillId} ≥ 4`);

  // The breakdown is saved with the proposal, so it survives a reload.
  await page.reload();
  await page.getByRole("button", { name: "Proposals (1) ▸" }).click();
  await expect(
    page.getByRole("region", { name: "Proposal 1" }).getByText("2 unmet requirements"),
  ).toBeVisible();
});

test("the retired Teams and Optimization pages redirect to projects", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([
    "Dashboard",
    /^People\d*$/,
    /^Projects\d*$/,
    "Organization",
    /e2e-manager@example\.com$/,
  ]);

  await page.goto("/teams");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/optimization");
  await expect(page).toHaveURL(/\/projects$/);
});

test("a user without optimization:run sees no Optimize button", async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e-employee-${suffix}@example.com`;
  const password = "hunter2pass";
  const projectName = `Employee Project ${suffix}`;

  // Registration grants "manager"; revoking it leaves an account with no permissions.
  const user = await (
    await page.request.post("/api/v1/auth/register", { data: { email, password } })
  ).json();
  const managerLogin = await page.request.post("/api/v1/auth/login", {
    data: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
  });
  const { access_token: managerToken } = await managerLogin.json();
  await page.request.post(`/api/v1/auth/users/${user.id}/roles`, {
    data: { role: "manager", grant: false },
    headers: { Authorization: `Bearer ${managerToken}` },
  });

  const login = await page.request.post("/api/v1/auth/login", { data: { email, password } });
  const { access_token: accessToken } = await login.json();
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const organization = await (
    await page.request.post("/api/v1/organizations/", {
      data: { name: `Employee Org ${suffix}` },
      headers: authorization,
    })
  ).json();
  const project = await (
    await page.request.post("/api/v1/projects/", {
      data: { name: projectName },
      headers: { ...authorization, "X-Organization-Id": organization.id },
    })
  ).json();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Optimize staffing" })).toHaveCount(0);
});
