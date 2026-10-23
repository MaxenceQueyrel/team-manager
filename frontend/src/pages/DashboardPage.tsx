import {
  Calendar,
  CircleCheck,
  type LucideIcon,
  Plus,
  SlidersHorizontal,
  Star,
  UserPlus,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import {
  addDays,
  enumerateDays,
  formatDay,
  formatSpan,
  isoToday,
  MONTH_NAMES,
  mondayOf,
  parseISODate,
} from "@/components/common/dates";
import {
  Avatar,
  Button,
  Card,
  colors,
  FillBar,
  PageHeader,
  Pill,
  StatTile,
} from "@/components/common/ui";
import { FREE_HORIZON_DAYS, freeNextDays } from "@/components/people/PeopleWorkspace";
import { PersonForm } from "@/components/people/PersonForm";
import {
  STATUS_STYLES,
  summarizeWeek,
  type WeekStatus,
} from "@/components/people/WeeklyAvailability";
import { ProjectForm } from "@/components/projects/ProjectForm";
import {
  buildLanes,
  fillTones,
  formatFte,
  formatHeadcount,
  needsStaffing,
  type ProjectStatus,
  projectFill,
  projectSpan,
  projectStatus,
  projectStatusLabels,
  projectStatusTones,
  staffedFte,
} from "@/components/projects/staffing";
import { assignmentsApi, errorMessage, peopleApi } from "@/services/api";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type {
  Assignment,
  AvailabilitySegment,
  DateRange,
  Person,
  Project,
  Seniority,
  Team,
} from "@/types";

const HEATMAP_WEEKS = 6;
const HEATMAP_MAX_PEOPLE = 8;
const ATTENTION_LIMIT = 5;
const TABLE_MAX_PROJECTS = 8;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SENIORITY_ORDER: Seniority[] = ["lead", "senior", "mid", "junior"];

const HEATMAP_LABELS: Record<WeekStatus, string> = {
  free: "Fully free",
  partly: "Partly booked",
  booked: "Fully booked or off",
};

// Running projects first: the table is a glance at what is in flight, not a full list.
const STATUS_RANK: Record<ProjectStatus, number> = {
  running: 0,
  unstaffed: 1,
  ended: 2,
  complete: 3,
};

const TABLE_COLUMNS = "minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.8fr) 6.5rem";

interface ProjectRow {
  project: Project;
  staffed: number;
  total: number;
  status: ProjectStatus;
  needsStaffing: boolean;
  span: DateRange | null;
}

interface AttentionItem {
  key: string;
  icon: LucideIcon;
  tone: "warning" | "primary";
  title: string;
  detail: string;
  action: string;
  to: string;
}

interface PersonWeeks {
  person: Person;
  weeks: { start: string; status: WeekStatus }[];
  free: number;
}

function longDate(iso: string): string {
  const date = parseISODate(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

function seniorityBreakdown(people: Person[]): string {
  return SENIORITY_ORDER.flatMap((level) => {
    const count = people.filter((p) => p.seniority === level).length;
    return count > 0 ? [`${count} ${level}`] : [];
  }).join(" · ");
}

function requiredSkills(project: Project): string[] {
  return [
    ...project.skill_requirements.map((req) => req.id),
    ...project.phases.flatMap((phase) => phase.skill_requirements.map((req) => req.id)),
  ];
}

function attentionItems(
  rows: ProjectRow[],
  people: Person[],
  teams: Team[],
  today: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const { project, total, status, span } of rows) {
    if (status !== "unstaffed") continue;
    items.push({
      key: `unstaffed-${project.id}`,
      icon: UserPlus,
      tone: "warning",
      title: `${project.name} has nobody assigned`,
      detail: `0 / ${formatFte(total)} FTE staffed · ${span ? formatSpan(span, today) : "no dates set"}`,
      action: "Staff it",
      to: `/projects/${encodeURIComponent(project.id)}`,
    });
  }

  for (const { project, staffed, total, status, span } of rows) {
    if (status !== "ended" || !span) continue;
    const endYear = span.end.slice(0, 4) !== today.slice(0, 4);
    items.push({
      key: `ended-${project.id}`,
      icon: Calendar,
      tone: "warning",
      title: `${project.name} ended on ${formatDay(span.end, endYear)}, still open`,
      detail: `Finished at ${formatFte(staffed)} / ${formatFte(total)} FTE. Close it or extend the dates`,
      action: "Review",
      to: `/projects/${encodeURIComponent(project.id)}`,
    });
  }

  const covered = new Set(people.flatMap((p) => p.skills.map((s) => s.id)));
  const uncovered = [
    ...new Set(
      rows.flatMap((row) => (row.status === "complete" ? [] : requiredSkills(row.project))),
    ),
  ]
    .filter((id) => !covered.has(id))
    .sort();
  const unskilled = people.filter((p) => p.skills.length === 0);
  if (uncovered.length > 0 || unskilled.length > 0) {
    const unskilledLine =
      unskilled.length === 1
        ? `${unskilled[0].name} (${unskilled[0].role}) has no skills recorded yet`
        : `${unskilled.length} people have no skills recorded yet`;
    let title = unskilledLine;
    let detail = "Skills drive coverage checks and staffing proposals";
    if (uncovered.length > 0) {
      title =
        uncovered.length === 1
          ? `Nobody has the ${uncovered[0]} skill`
          : `Nobody has these required skills: ${uncovered.join(", ")}`;
      detail = unskilled.length > 0 ? unskilledLine : "Open projects require them";
    }
    items.push({
      key: "skills",
      icon: Star,
      tone: "primary",
      title,
      detail,
      action: "Add skills",
      to: unskilled.length === 1 ? `/people/${encodeURIComponent(unskilled[0].id)}` : "/people",
    });
  }

  // Proposals only matter while there is still staffing to decide on. Without any, a running
  // project short of FTE still needs staffing; unstaffed and ended ones have their rows above.
  for (const { project, staffed, total, status, needsStaffing, span } of rows) {
    if (!needsStaffing) continue;
    const count = teams.filter((t) => t.project_id === project.id).length;
    if (count === 0) {
      if (status !== "running") continue;
      items.push({
        key: `partly-staffed-${project.id}`,
        icon: UserPlus,
        tone: "warning",
        title: `${project.name} is partly staffed`,
        detail: `${formatFte(staffed)} / ${formatFte(total)} FTE staffed · ${span ? formatSpan(span, today) : "no dates set"}`,
        action: "Staff it",
        to: `/projects/${encodeURIComponent(project.id)}`,
      });
      continue;
    }
    items.push({
      key: `proposals-${project.id}`,
      icon: SlidersHorizontal,
      tone: "primary",
      title: `${count} staffing ${count === 1 ? "proposal" : "proposals"} to review`,
      detail: `Saved optimizer results on ${project.name}`,
      action: "Compare",
      to: `/projects/${encodeURIComponent(project.id)}`,
    });
  }

  return items;
}

/** The Overview: capacity, staffing gaps and what needs a decision, with who is free soon. */
export default function DashboardPage() {
  const {
    people,
    projects,
    teams,
    roles,
    fetchPeople,
    fetchProjects,
    fetchTeams,
    fetchRoles,
    fetchSkills,
    savePerson,
    saveProject,
  } = useAppStore();
  const skills = useAppStore(useShallow(knownSkillIds));
  const roleOptions = useAppStore(useShallow(knownRoleIds));
  const canWritePeople = useAuthStore((s) => s.permissions.has("people:write"));
  const canWriteProjects = useAuthStore((s) => s.permissions.has("projects:write"));
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [availability, setAvailability] = useState<Map<string, AvailabilitySegment[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<"person" | "project" | null>(null);

  const today = isoToday();
  const firstWeek = mondayOf(today);
  // Six whole weeks from this Monday always reach past the 30-day free horizon.
  const rangeEnd = addDays(firstWeek, HEATMAP_WEEKS * 7 - 1);

  // Keyed on the organization so switching it from the sidebar refreshes the assignments
  // and proposals, which nothing else refetches.
  useEffect(() => {
    if (!activeOrganizationId) return;
    fetchPeople();
    fetchProjects();
    fetchTeams();
    fetchRoles();
    fetchSkills();
    assignmentsApi
      .list()
      .then(setAssignments)
      .catch((e) => setError(errorMessage(e)));
  }, [activeOrganizationId, fetchPeople, fetchProjects, fetchTeams, fetchRoles, fetchSkills]);

  // Re-run whenever the roster is refetched so a newly added person shows up.
  useEffect(() => {
    if (people.length === 0) return;
    peopleApi
      .availability(firstWeek, rangeEnd)
      .then((all) => setAvailability(new Map(all.map((a) => [a.person_id, a.segments]))))
      .catch((e) => setError(errorMessage(e)));
  }, [people, firstWeek, rangeEnd]);

  const rows = useMemo<ProjectRow[] | null>(() => {
    if (!assignments) return null;
    return projects.map((project) => {
      const lanes = buildLanes(project, assignments);
      return {
        project,
        ...staffedFte(lanes),
        status: projectStatus(project, lanes, today),
        needsStaffing: needsStaffing(project, lanes),
        span: projectSpan(project),
      };
    });
  }, [projects, assignments, today]);

  const heatmap = useMemo<PersonWeeks[] | null>(() => {
    if (!availability) return null;
    const weekStarts = enumerateDays(firstWeek, rangeEnd).filter((_, i) => i % 7 === 0);
    return people.map((person) => {
      const weeks = weekStarts.map((start) =>
        summarizeWeek(start, availability.get(person.id) ?? [], person.base_capacity),
      );
      return { person, weeks, free: weeks.reduce((sum, w) => sum + w.free, 0) };
    });
  }, [availability, people, firstWeek, rangeEnd]);

  const freeByPerson = useMemo(() => {
    if (!availability) return null;
    return new Map(people.map((p) => [p.id, freeNextDays(availability.get(p.id) ?? [], today)]));
  }, [availability, people, today]);

  const capacity = people.reduce((sum, p) => sum + p.base_capacity, 0);
  const attention = rows ? attentionItems(rows, people, teams, today) : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        eyebrow={`${longDate(today)} · next ${FREE_HORIZON_DAYS} days`}
        actions={
          <>
            {canWritePeople && (
              <Button icon={Plus} onClick={() => setCreating("person")}>
                Add person
              </Button>
            )}
            {canWriteProjects && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating("project")}>
                New project
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p role="alert" style={{ color: colors.danger, margin: "0 0 1rem", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <StatTile
          label="Team capacity"
          value={formatFte(capacity)}
          unit={`FTE · ${formatHeadcount(people.length)}`}
          sub={people.length > 0 ? seniorityBreakdown(people) : "Add people to plan capacity"}
        />
        <FreeTile people={people} capacity={capacity} freeByPerson={freeByPerson} />
        <GapTile rows={rows} />
        <SkillsTile skills={skills} people={people} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "1.25rem",
          alignItems: "start",
          marginBottom: "1.75rem",
        }}
      >
        <AttentionCard items={attention} />
        <WhoIsFreeCard heatmap={heatmap} hasPeople={people.length > 0} />
      </div>

      <ProjectsCard rows={rows} today={today} />

      {creating === "person" && (
        <PersonForm
          person={null}
          people={people}
          roles={roles}
          roleOptions={roleOptions}
          skillOptions={skills}
          onClose={() => setCreating(null)}
          onSave={async (draft) => {
            await savePerson(draft);
            setCreating(null);
          }}
        />
      )}
      {creating === "project" && (
        <ProjectForm
          project={null}
          people={people}
          skillOptions={skills}
          onClose={() => setCreating(null)}
          onSave={async (draft) => {
            await saveProject(draft);
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}

function FreeTile({
  people,
  capacity,
  freeByPerson,
}: {
  people: Person[];
  capacity: number;
  freeByPerson: Map<string, number> | null;
}) {
  const label = `Free next ${FREE_HORIZON_DAYS} days`;
  if (people.length === 0) {
    return <StatTile label={label} value="0" unit="FTE" sub="Add people to see who's free" />;
  }
  if (!freeByPerson) return <StatTile label={label} value="…" unit="FTE" />;

  const free = people.reduce((sum, p) => sum + (freeByPerson.get(p.id) ?? 0), 0);
  const percent = Math.round((free / capacity) * 100);
  const booked = people.filter((p) => (freeByPerson.get(p.id) ?? 0) < 0.005).length;
  // Half-hundredth tolerance: averaged ratios rarely land exactly on the capacity.
  const allFree = people.every((p) => (freeByPerson.get(p.id) ?? 0) >= p.base_capacity - 0.005);
  let sentence = `${percent}% unallocated · everyone has some time free`;
  if (allFree) sentence = "100% unallocated: nobody is booked";
  else if (booked === people.length) sentence = "Everyone is fully booked";
  else if (booked > 0)
    sentence = `${percent}% unallocated · ${formatHeadcount(booked)} fully booked`;

  return (
    <StatTile
      label={label}
      value={formatFte(free)}
      unit="FTE"
      fill={{ value: free, max: capacity, tone: "success" }}
      sub={
        <span style={{ color: free > 0 ? colors.success : colors.warningText }}>{sentence}</span>
      }
    />
  );
}

function GapTile({ rows }: { rows: ProjectRow[] | null }) {
  if (!rows) return <StatTile label="Staffing gap" value="…" unit="FTE missing" />;
  const gapped = rows.filter((row) => row.needsStaffing);
  const missing = gapped.reduce((sum, row) => sum + row.total - row.staffed, 0);
  return (
    <StatTile
      label="Staffing gap"
      value={formatFte(missing)}
      unit="FTE missing"
      accent={missing > 0 ? "warning" : undefined}
      sub={
        gapped.length > 0 ? (
          <Link to="/projects?status=needs-staffing">
            Across {gapped.length} of {rows.length} projects
          </Link>
        ) : rows.length > 0 ? (
          "Every open project is fully staffed"
        ) : (
          "No projects yet"
        )
      }
    />
  );
}

function SkillsTile({ skills, people }: { skills: string[]; people: Person[] }) {
  const covered = new Set(people.flatMap((p) => p.skills.map((s) => s.id)));
  const uncovered = skills.filter((id) => !covered.has(id)).length;
  let sub = "Each one has someone covering it";
  if (skills.length === 0) sub = "None recorded yet";
  else if (uncovered > 0)
    sub = `${uncovered} ${uncovered === 1 ? "has" : "have"} no one covering it`;
  return (
    <StatTile
      label="Skills tracked"
      value={skills.length}
      unit={skills.length === 1 ? "skill" : "skills"}
      sub={
        <Link to="/people/catalog" style={{ color: "inherit" }}>
          {sub}
        </Link>
      }
    />
  );
}

function SectionCard({
  title,
  badge,
  link,
  children,
}: {
  title: string;
  badge?: ReactNode;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "1.1rem 1.5rem",
          }}
        >
          <h2 id={headingId} style={{ margin: 0 }}>
            {title}
          </h2>
          {badge}
          {link && (
            <Link to={link.to} style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              {link.label} →
            </Link>
          )}
        </div>
        {children}
      </Card>
    </section>
  );
}

const mutedLine: CSSProperties = {
  margin: 0,
  padding: "0 1.5rem 1.25rem",
  color: colors.muted,
  fontSize: "0.9rem",
};

function AttentionCard({ items }: { items: AttentionItem[] | null }) {
  const [showAll, setShowAll] = useState(false);
  if (!items) {
    return (
      <SectionCard title="Needs your attention">
        <p style={mutedLine}>Loading…</p>
      </SectionCard>
    );
  }
  const visible = showAll ? items : items.slice(0, ATTENTION_LIMIT);

  return (
    <SectionCard
      title="Needs your attention"
      badge={
        items.length > 0 && (
          <Pill tone="warning" style={{ fontFamily: "var(--font-mono)" }}>
            {items.length}
          </Pill>
        )
      }
    >
      {items.length === 0 ? (
        <p
          style={{
            ...mutedLine,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: colors.success,
          }}
        >
          <CircleCheck size={18} aria-hidden />
          All clear: nothing needs a decision right now.
        </p>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </ul>
          {items.length > ATTENTION_LIMIT && (
            <div style={{ borderTop: `1px solid ${colors.border}`, padding: "0.6rem 1.5rem" }}>
              <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${items.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.icon;
  const tint =
    item.tone === "warning"
      ? { background: colors.warningBg, color: colors.warning }
      : { background: colors.primaryBg, color: colors.primary };
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.95rem 1.5rem",
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: "var(--radius)",
          ...tint,
        }}
      >
        <Icon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        <div style={{ marginTop: "0.15rem", fontSize: "0.88rem", color: colors.muted }}>
          {item.detail}
        </div>
      </div>
      <Link
        to={item.to}
        className="btn btn-secondary btn-sm"
        style={{ flexShrink: 0, textDecoration: "none" }}
      >
        {item.action}
      </Link>
    </li>
  );
}

function WhoIsFreeCard({
  heatmap,
  hasPeople,
}: {
  heatmap: PersonWeeks[] | null;
  hasPeople: boolean;
}) {
  const link = { to: "/people/capacity", label: "Capacity planner" };
  if (!hasPeople) {
    return (
      <SectionCard title="Who's free" link={link}>
        <p style={mutedLine}>No people yet.</p>
      </SectionCard>
    );
  }
  if (!heatmap) {
    return (
      <SectionCard title="Who's free" link={link}>
        <p style={mutedLine}>Loading…</p>
      </SectionCard>
    );
  }

  // Most free first; the sort is stable, so equally free people keep the roster order.
  const shown = [...heatmap].sort((a, b) => b.free - a.free).slice(0, HEATMAP_MAX_PEOPLE);
  const hidden = heatmap.length - shown.length;
  const weekStarts = heatmap[0].weeks.map((w) => w.start);
  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `minmax(6.5rem, 1.3fr) repeat(${HEATMAP_WEEKS}, minmax(30px, 1fr))`,
    alignItems: "center",
    columnGap: 6,
  };

  return (
    <SectionCard title="Who's free" link={link}>
      <div style={{ padding: "0 1.5rem 1.25rem" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 360 }}>
            <div aria-hidden style={{ ...grid, marginBottom: "0.5rem" }}>
              <span />
              {weekStarts.map((start) => (
                <span
                  key={start}
                  style={{ fontSize: "0.8rem", color: colors.muted, textAlign: "center" }}
                >
                  {formatDay(start)}
                </span>
              ))}
            </div>
            {shown.map(({ person, weeks }) => {
              const firstName = person.name.split(" ")[0];
              return (
                <div key={person.id} style={{ ...grid, marginBottom: 6 }}>
                  <Link
                    to={`/people/${encodeURIComponent(person.id)}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      minWidth: 0,
                      color: colors.text,
                    }}
                  >
                    <Avatar name={person.name} size="sm" />
                    <span
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {firstName}
                    </span>
                  </Link>
                  {weeks.map((week) => {
                    const label = `${person.name}, week of ${formatDay(week.start)}: ${HEATMAP_LABELS[week.status].toLowerCase()}`;
                    return (
                      <div
                        key={week.start}
                        role="img"
                        aria-label={label}
                        title={label}
                        style={{
                          height: 26,
                          borderRadius: "var(--radius-sm)",
                          background: STATUS_STYLES[week.status].color,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {hidden > 0 && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: colors.muted }}>
            {hidden} more in the <Link to="/people/capacity">capacity planner</Link>
          </p>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem 1.1rem",
            marginTop: "0.9rem",
            fontSize: "0.82rem",
            color: colors.muted,
          }}
        >
          {(["free", "partly", "booked"] as const).map((status) => (
            <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: STATUS_STYLES[status].color,
                }}
              />
              {HEATMAP_LABELS[status]}
            </span>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function ProjectsCard({ rows, today }: { rows: ProjectRow[] | null; today: string }) {
  const link = { to: "/projects", label: "All projects" };
  if (!rows) {
    return (
      <SectionCard title="Projects" link={link}>
        <p style={mutedLine}>Loading…</p>
      </SectionCard>
    );
  }
  const shown = rows
    .filter((row) => row.status !== "complete")
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
    .slice(0, TABLE_MAX_PROJECTS);
  if (shown.length === 0) {
    return (
      <SectionCard title="Projects" link={link}>
        <p style={mutedLine}>
          {rows.length === 0 ? "No projects yet." : "No open projects: every project is complete."}
        </p>
      </SectionCard>
    );
  }

  const rowGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: TABLE_COLUMNS,
    alignItems: "center",
    gap: "1.5rem",
    padding: "0.95rem 1.5rem",
    borderTop: `1px solid ${colors.border}`,
  };

  return (
    <SectionCard title="Projects" link={link}>
      <div style={{ overflowX: "auto" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, minWidth: 640 }}>
          {shown.map(({ project, staffed, total, status, span }) => {
            const fill = projectFill(staffed, total);
            return (
              <li key={project.id} style={rowGrid}>
                <div style={{ minWidth: 0 }}>
                  <Link
                    to={`/projects/${encodeURIComponent(project.id)}`}
                    style={{ fontWeight: 600, color: colors.text }}
                  >
                    {project.name}
                  </Link>
                  <div
                    style={{
                      marginTop: "0.15rem",
                      fontSize: "0.88rem",
                      color: colors.muted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.description || "No description"}
                  </div>
                </div>
                <div
                  className={span ? "mono" : undefined}
                  style={{ fontSize: "0.88rem", color: span ? colors.text : colors.muted }}
                >
                  {span ? formatSpan(span, today) : "No dates"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
                  <FillBar value={staffed} max={total} tone={fillTones[fill]} style={{ flex: 1 }} />
                  <span className="mono" style={{ fontSize: "0.88rem", whiteSpace: "nowrap" }}>
                    {formatFte(staffed)} / {formatFte(total)}
                  </span>
                </div>
                <div>
                  <Pill tone={projectStatusTones[status]} dot>
                    {projectStatusLabels[status]}
                  </Pill>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
