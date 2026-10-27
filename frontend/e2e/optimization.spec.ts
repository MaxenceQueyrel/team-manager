import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  createPerson,
  createProject,
  MANAGER_EMAIL,
  MANAGER_PASSWORD,
  uniqueSuffix,
} from "./helpers";

const PROJECT_CSV_HEADER =
  "id,name,description,priority,skill_requirements,excluded_person_ids,included_person_ids,squads,date_ranges,phases";

const PEOPLE_CSV_HEADER =
  "id,name,role,seniority,years_of_experience,working_days_per_week,manager_id,skills,vacations,availability_windows,preferences,growth_targets,affinities";

const quote = (value: unknown) => `"${JSON.stringify(value).replace(/"/g, '""')}"`;

/** Imports full-time mid-level people through the People page CSV upload. */
async function importPeople(
  page: Page,
  people: {
    id: string;
    name: string;
    skills?: { id: string; level: number }[];
    vacations?: { start: string; end: string }[];
  }[],
): Promise<void> {
  const rows = people.map(
    ({ id, name, skills = [], vacations = [] }) =>
      `${id},${name},${id},mid,3,5,,${quote(skills)},${quote(vacations)},[],[],[],{}`,
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

/** Imports a non-phased project spanning January 2027, then opens its workspace. By default it
 * needs 1 FTE of a skill anyone can fill. */
async function importDatedProject(
  page: Page,
  {
    id,
    name,
    skillRequirements = [{ id: "general", min_level: 0, fte: 1 }],
    excludedPersonIds = [],
    includedPersonIds = [],
    squads = [],
  }: {
    id: string;
    name: string;
    skillRequirements?: { id: string; min_level: number; fte: number; max_people?: number }[];
    excludedPersonIds?: string[];
    includedPersonIds?: string[];
    squads?: { member_ids: string[] }[];
  },
): Promise<void> {
  const dateRanges = [{ start: "2027-01-01", end: "2027-01-31" }];
  const csv = [
    PROJECT_CSV_HEADER,
    `${id},${name},,high,${quote(skillRequirements)},${quote(excludedPersonIds)},${quote(includedPersonIds)},${quote(squads)},${quote(dateRanges)},[]`,
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

  await createProject(page, name);
  await page.getByRole("link", { name }).click();

  await runOptimization(page);
  await expect(page.getByRole("tab", { name: /^Proposals/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(/\?tab=proposals$/);
  await expect(
    page.getByRole("region", { name: "Best team" }).getByText("Optimization score:"),
  ).toBeVisible();
});

test("alternative teams are collapsed by default and show their delta vs best", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Alternatives ${suffix}`;

  // A 1-FTE project needs three eligible people to yield the best team plus the
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

  await page.getByRole("button", { name: "Show 2 alternative teams" }).click();
  await expect(alternativeHeadings).toHaveCount(2);
  await expect(page.getByText(/vs best|same score as best/)).toHaveCount(2);

  // Without a start window the result has no per-start strip and no start label.
  await expect(page.getByRole("region", { name: "Start dates tried" })).toHaveCount(0);
  await expect(page.getByText(/^Starts /)).toHaveCount(0);
});

test("a flexible start window picks the start where the team is free and applying moves the dates", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Window ${suffix}`;
  const personId = `returning-${suffix}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByLabel("Earliest start")).toBeDisabled();
  await expect(page.getByLabel("Latest start")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  // The only candidate is away for the planned month, so the first start after the
  // vacation is the only one the team fully covers.
  await importPeople(page, [
    {
      id: personId,
      name: `Returning ${suffix}`,
      vacations: [{ start: "2027-01-01", end: "2027-01-31" }],
    },
  ]);
  await importDatedProject(page, {
    id: `window-${suffix}`,
    name: projectName,
    excludedPersonIds: await everyoneElse(page, [personId]),
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Earliest start").fill("2027-02-05");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Fill in both earliest and latest start, or leave both empty.",
  );
  await page.getByLabel("Latest start").fill("2027-01-01");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Latest start must not be before earliest start",
  );
  await page.getByLabel("Earliest start").fill("2027-01-01");
  await page.getByLabel("Latest start").fill("2027-02-05");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Earliest start")).toHaveCount(0);

  await runOptimization(page);
  const strip = page.getByRole("region", { name: "Start dates tried" });
  await expect(strip.getByRole("listitem")).toHaveCount(6);
  await expect(strip.locator('[aria-current="true"]')).toContainText("5 Feb");
  await expect(strip.locator('[aria-current="true"]')).toContainText("covered · chosen");
  const best = page.getByRole("region", { name: "Best team" });
  await expect(best.getByText("Starts 5 Feb 2027 (+5 weeks vs planned)")).toBeVisible();

  // Starting on 29 Jan only overlaps February, so the team is a partial one.
  const chosenStart = strip.getByRole("button", { name: /5 Feb/ });
  const earlierStart = strip.getByRole("button", { name: /29 Jan/ });
  await expect(chosenStart).toHaveAttribute("aria-pressed", "true");
  await earlierStart.click();
  await expect(earlierStart).toHaveAttribute("aria-pressed", "true");
  await expect(chosenStart).toHaveAttribute("aria-pressed", "false");
  await expect(earlierStart).toContainText("partial");
  const selected = page.getByRole("region", { name: "Team at selected start" });
  await expect(selected.getByText("Starts 29 Jan 2027 (+4 weeks vs planned)")).toBeVisible();
  await expect(selected.getByText(`Returning ${suffix}`)).toBeVisible();
  await expect(best).toHaveCount(0);
  await chosenStart.click();
  await expect(selected).toHaveCount(0);
  await expect(chosenStart).toHaveAttribute("aria-pressed", "true");

  await best.getByRole("button", { name: "Apply to project" }).click();
  await expect(
    page.getByText(
      "It also moves the project's dates so that it starts 5 Feb 2027 (+5 weeks vs planned).",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(best.getByText(/^Starts /)).toHaveCount(0);

  await page.getByRole("tab", { name: "Staffing" }).click();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toContainText("5 Feb 2027");
  await expect(timeline).toContainText("7 Mar 2027");
  await expect(page.getByRole("region", { name: "Staffing" })).toContainText("1 of 1 FTE");
});

test("applying proposals replaces the project's staffing", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Apply ${suffix}`;
  for (const i of [1, 2, 3]) {
    await createPerson(page, `Applicant ${i} ${suffix}`, `applicant-${i}-${suffix}`);
  }
  await importDatedProject(page, { id: `apply-${suffix}`, name: projectName });
  const lane = page.getByRole("region", { name: "Staffing" });
  await expect(lane).toContainText("0 of 1 FTE");

  await runOptimization(page);
  const best = page.getByRole("region", { name: "Best team" });
  await expect(best.getByText("added", { exact: true })).toHaveCount(1);

  await best.getByRole("button", { name: "Apply to project" }).click();
  await expect(
    page.getByText("This replaces current staffing for the whole project."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(best.getByText("added", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Staffing" }).click();
  await expect(lane).toContainText("1 of 1 FTE");

  // The result stays in place while switching tabs.
  await page.getByRole("tab", { name: /^Proposals/ }).click();
  await page.getByRole("button", { name: "Show 2 alternative teams" }).click();
  const alternative = page.getByRole("region", { name: "Alternative 1" });
  await expect(alternative.getByText("added", { exact: true })).toHaveCount(1);
  await expect(alternative.getByText("dropped", { exact: true })).toHaveCount(1);

  await alternative.getByRole("button", { name: "Apply to project" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(alternative.getByText("added", { exact: true })).toHaveCount(0);

  // The solve saves the best team; applying the alternative saves it too.
  const proposals = page.getByRole("region", { name: "Proposals", exact: true });
  await expect(proposals.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /^Proposals/ })).toContainText("2");

  await page.getByRole("tab", { name: "Staffing" }).click();
  await expect(lane.getByRole("listitem")).toHaveCount(1);
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
  const lane = page.getByRole("region", { name: "Staffing" });
  await lane.getByRole("button", { name: "Assign person to Whole project" }).click();
  await lane.getByLabel("Person").selectOption({ label: personName });
  await lane.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(lane).toContainText("1 of 1 FTE");

  await page.goto(`/projects/conflict-proposed-${suffix}`);
  await page.getByRole("tab", { name: /^Proposals/ }).click();
  await page.getByRole("button", { name: "Review proposal 1" }).click();
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
  // Every selected person carries at least 0.2 FTE, so six people co-selected as a
  // squad can never fit a one-FTE project once nobody else can be picked instead.
  const members = Array.from({ length: 6 }, (_, i) => ({
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
    `Squad of Squad Member 1 ${suffix}, Squad Member 2 ${suffix}, Squad Member 3 ${suffix} and 3 more (6 people) must be staffed together at 0.2 FTE or more each, which doesn't fit the 1 FTE the project needs.`,
  );
  await expect(alert).toContainText(
    "Drop or shrink the squad, or raise the required FTE or max people.",
  );
  await expect(alert).not.toContainText("status code 409");
  await expect(page.getByRole("heading", { name: "Optimization result" })).toHaveCount(0);
});

test("a partially covered proposal breaks down its unmet requirements", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `Optimization Partial ${suffix}`;
  const skillId = `rare-skill-${suffix}`;
  const expertId = `expert-${suffix}`;
  const expertName = `Expert ${suffix}`;
  await importPeople(page, [
    { id: expertId, name: expertName, skills: [{ id: skillId, level: 4 }] },
  ]);
  // A single full-time candidate can staff only half of two FTE.
  await importDatedProject(page, {
    id: `partial-${suffix}`,
    name: projectName,
    skillRequirements: [{ id: skillId, min_level: 4, fte: 2 }],
    excludedPersonIds: await everyoneElse(page, [expertId]),
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
  await expect(skillRow).toContainText("1 / 2 FTE covered · level ≥ 4");
  await expect(skillRow).toContainText(`Add a candidate with ${skillId} ≥ 4`);
  await expect(
    best.getByText(`${expertName} (${expertId}) — 100% FTE (${skillId} 100%)`),
  ).toBeVisible();

  // The breakdown is saved with the proposal, so it survives a reload.
  await page.reload();
  await page.getByRole("button", { name: "Review proposal 1" }).click();
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
      data: {
        name: projectName,
        skill_requirements: [{ id: "general", min_level: 0, fte: 1 }],
      },
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

test("selected projects are optimized together and applied all at once", async ({ page }) => {
  const suffix = uniqueSuffix();
  const people = [1, 2].map((i) => ({
    id: `batch-${i}-${suffix}`,
    name: `Batch Person ${i} ${suffix}`,
  }));
  await importPeople(page, people);
  const excluded = await everyoneElse(
    page,
    people.map((p) => p.id),
  );

  // Two 1-FTE projects over the same month, each staffable by one of the two people.
  const names = ["Alpha", "Beta", "Gamma"].map((n) => `Batch ${n} ${suffix}`);
  const skills = [{ id: "general", min_level: 0, fte: 1 }];
  const dateRanges = [{ start: "2027-01-01", end: "2027-01-31" }];
  const csv = [
    PROJECT_CSV_HEADER,
    ...names.map(
      (name, i) =>
        `batch-${i}-${suffix},${name},,${i === 0 ? "high" : "low"},${quote(skills)},${quote(excluded)},[],[],${quote(dateRanges)},[]`,
    ),
  ].join("\n");
  await page.goto("/projects");
  await page.locator('input[type="file"]').setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("Import complete — created 3.")).toBeVisible();

  await page.getByRole("link", { name: names[2] }).click();
  await page.getByRole("button", { name: `More actions for ${names[2]}` }).click();
  await page.getByRole("menuitem", { name: "Mark complete" }).click();
  await expect(page.getByText(/^Marked complete on/)).toBeVisible();

  await page.goto("/projects");
  await expect(page.getByLabel(`Select ${names[2]}`)).toBeDisabled();
  await page.getByLabel(`Select ${names[0]}`).check();
  await expect(page.getByRole("button", { name: "Optimize selected (1)" })).toBeDisabled();
  await page.getByLabel(`Select ${names[1]}`).check();
  await page.getByRole("button", { name: "Optimize selected (2)" }).click();
  await expect(page).toHaveURL(/\/projects\/optimize\?ids=/);

  await page.getByRole("button", { name: "Find optimal teams" }).click();
  const results = page.getByRole("region", { name: "Optimization results" });
  await expect(results.getByText("projects fully covered")).toBeVisible();
  await expect(results.getByText("2 / 2", { exact: true })).toBeVisible();
  const cards = results.getByRole("region", { name: /^Batch (Alpha|Beta) / });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAccessibleName(names[0]);
  for (const name of names.slice(0, 2)) {
    const card = results.getByRole("region", { name, exact: true });
    await expect(card.getByText("All requirements covered")).toBeVisible();
    await expect(card.getByText("Optimization score:")).toBeVisible();
  }

  await results.getByRole("button", { name: "Apply all" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied all 2 teams.")).toBeVisible();

  await page.goto("/projects");
  for (const name of names.slice(0, 2)) {
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(row).toContainText("1 / 1");
  }
});
