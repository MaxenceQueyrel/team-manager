import { isAxiosError } from "axios";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import {
  addDays,
  formatDay,
  formatDuration,
  formatSpan,
  isoToday,
} from "@/components/common/dates";
import {
  Avatar,
  Button,
  Card,
  Columns,
  colors,
  fonts,
  PageHeader,
  Pill,
  StatTile,
  seniorityLabels,
  seniorityTones,
  TabPanel,
  Tabs,
} from "@/components/common/ui";
import { AssignToProjectModal } from "@/components/people/AssignToProjectModal";
import { FREE_HORIZON_DAYS, freeNextDays } from "@/components/people/PeopleWorkspace";
import { PersonForm } from "@/components/people/PersonForm";
import { SkillsModal } from "@/components/people/SkillsModal";
import { TimeOffModal } from "@/components/people/TimeOffModal";
import { WeeklyAvailability } from "@/components/people/WeeklyAvailability";
import { commitmentForRatio } from "@/components/projects/StaffingLaneCard";
import { buildLanes, formatFte, isOpenForStaffing } from "@/components/projects/staffing";
import { assignmentsApi, errorMessage, peopleApi } from "@/services/api";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, Person, Project } from "@/types";

type Dialog = "profile" | "assign" | "skills" | "time-off" | null;

type PersonTab = "overview" | "availability" | "history";

function parseTab(value: string | null): PersonTab {
  return value === "availability" || value === "history" ? value : "overview";
}

function joinList(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Points at the open project whose skill requirements the person meets the most of. */
function skillMatchHint(person: Person, projects: Project[], today: string): string {
  let best: { project: Project; skills: string[] } | null = null;
  for (const project of projects) {
    if (!isOpenForStaffing(project, today)) continue;
    const lanes = buildLanes(project, []);
    const matched = new Set<string>();
    for (const lane of lanes) {
      for (const req of lane.skillRequirements) {
        if (person.skills.some((s) => s.id === req.id && s.level >= req.min_level)) {
          matched.add(req.id);
        }
      }
    }
    if (matched.size > (best?.skills.length ?? 0)) best = { project, skills: [...matched] };
  }
  if (!best) return `No open project asks for ${person.name}'s skills yet.`;
  const verb = best.skills.length === 1 ? "matches" : "match";
  return `${person.name}'s ${joinList(best.skills)} ${verb} the requirements on ${best.project.name}.`;
}

export default function PersonDetailPage() {
  const { id = "" } = useParams();
  const {
    people,
    roles,
    projects,
    fetchPeople,
    fetchRoles,
    fetchSkills,
    fetchProjects,
    savePerson,
  } = useAppStore();
  const roleOptions = useAppStore(useShallow(knownRoleIds));
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWritePeople = useAuthStore((s) => s.permissions.has("people:write"));
  const [person, setPerson] = useState<Person | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [freeSoon, setFreeSoon] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  useEffect(() => {
    fetchPeople();
    fetchRoles();
    fetchSkills();
    fetchProjects();
  }, [fetchPeople, fetchRoles, fetchSkills, fetchProjects]);

  useEffect(() => {
    setPerson(null);
    setNotFound(false);
    setError(null);
    peopleApi
      .get(id)
      .then(setPerson)
      .catch((e) => {
        if (isAxiosError(e) && e.response?.status === 404) setNotFound(true);
        else setError(errorMessage(e));
      });
    assignmentsApi
      .list({ person_id: id })
      .then(setAssignments)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  // Depends on `person` so the figure refreshes after time off or assignments change.
  useEffect(() => {
    if (!person) return;
    const today = isoToday();
    setFreeSoon(null);
    peopleApi
      .availability(today, addDays(today, FREE_HORIZON_DAYS - 1))
      .then((all) => {
        const segments = all.find((a) => a.person_id === person.id)?.segments ?? [];
        setFreeSoon(freeNextDays(segments, today));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [person]);

  const today = isoToday();
  const { current, past } = useMemo(() => {
    const sorted = [...assignments].sort((a, b) => a.start.localeCompare(b.start));
    return {
      current: sorted.filter((a) => a.end >= today),
      past: sorted.filter((a) => a.end < today).reverse(),
    };
  }, [assignments, today]);

  if (notFound) {
    return (
      <div>
        <h1 style={{ margin: "0 0 1rem" }}>Person not found</h1>
        <p style={{ color: colors.muted }}>
          No person with id <code>{id}</code> exists in this organization.
        </p>
        <Link to="/people">← Back to People</Link>
      </div>
    );
  }

  if (!person) {
    return error ? <p style={{ color: colors.danger }}>{error}</p> : <p>Loading…</p>;
  }

  const projectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name ?? projectId;
  const activeProjects = new Set(current.filter((a) => a.start <= today).map((a) => a.project_id));
  const lastProject = [...past].sort((a, b) => b.end.localeCompare(a.end))[0];
  const years = person.years_of_experience;
  const closeDialog = () => setDialog(null);
  const refreshPerson = async () => setPerson(await peopleApi.get(person.id));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "People", to: "/people" }, { label: person.name }]}
        leading={<Avatar name={person.name} size="lg" />}
        title={person.name}
        subtitle={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
            <span>{person.role}</span>
            <Pill tone={seniorityTones[person.seniority]}>{seniorityLabels[person.seniority]}</Pill>
            <span>
              {years} {years === 1 ? "yr" : "yrs"} experience
            </span>
          </span>
        }
        actions={
          <>
            {canWritePeople && (
              <Button icon={Pencil} onClick={() => setDialog("profile")}>
                Edit profile
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setDialog("assign")}>
              Assign to project
            </Button>
          </>
        }
      />

      {error && <p style={{ color: colors.danger, margin: "0 0 1rem" }}>{error}</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <StatTile
          label="Contracted"
          mono
          value={formatFte(person.base_capacity)}
          unit="FTE"
          sub={`${person.working_days_per_week} ${person.working_days_per_week === 1 ? "day" : "days"}/week`}
        />
        <StatTile
          label={`Free next ${FREE_HORIZON_DAYS} days`}
          mono
          value={freeSoon === null ? "…" : formatFte(freeSoon)}
          unit="FTE"
          accent={freeSoon === 0 ? "warning" : "success"}
        />
        <StatTile label="Active projects" mono value={activeProjects.size} />
        <StatTile
          label="Last project"
          value={
            lastProject ? (
              <Link
                to={`/projects/${encodeURIComponent(lastProject.project_id)}`}
                style={{ fontFamily: fonts.sans, fontSize: "1.05rem", fontWeight: 500 }}
              >
                {projectName(lastProject.project_id)}
              </Link>
            ) : (
              <span style={{ fontFamily: fonts.sans, fontSize: "1.05rem", color: colors.muted }}>
                None yet
              </span>
            )
          }
          sub={
            lastProject &&
            `ended ${formatDay(lastProject.end, !lastProject.end.startsWith(today.slice(0, 4)))}`
          }
        />
      </div>

      <Tabs
        ariaLabel="Person views"
        panels="person"
        value={tab}
        onChange={(value) => {
          const next = parseTab(value);
          // Replacing the entry keeps Back leaving the person instead of stepping through tabs.
          setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
        }}
        items={[
          { value: "overview", label: "Overview" },
          { value: "availability", label: "Availability" },
          { value: "history", label: "History", count: past.length > 0 ? past.length : undefined },
        ]}
        style={{ marginBottom: "1.5rem" }}
      />

      <TabPanel group="person" value="overview" active={tab === "overview"}>
        <Columns
          main={
            <SectionCard title="Assignments" flush>
              {current.length === 0 ? (
                <div style={{ padding: "0 1.5rem 1.25rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      flexWrap: "wrap",
                      padding: "1.1rem 1.4rem",
                      border: `1.5px dashed ${colors.borderStrong}`,
                      borderRadius: "var(--radius-lg)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>Not on any project right now</div>
                      <div style={{ marginTop: 2, fontSize: "0.88rem", color: colors.muted }}>
                        {skillMatchHint(person, projects, today)}
                      </div>
                    </div>
                    <Button onClick={() => setDialog("assign")}>Assign to project</Button>
                  </div>
                </div>
              ) : (
                <AssignmentList assignments={current} projectName={projectName} today={today} />
              )}
            </SectionCard>
          }
          side={
            <SectionCard
              title="Skills"
              action={
                canWritePeople && (
                  <Button size="sm" ariaLabel="Edit skills" onClick={() => setDialog("skills")}>
                    Edit
                  </Button>
                )
              }
            >
              <SkillLevels person={person} />
            </SectionCard>
          }
        />
      </TabPanel>

      <TabPanel group="person" value="availability" active={tab === "availability"}>
        <Columns
          main={<WeeklyAvailability person={person} />}
          side={
            <SectionCard title="Time off & exceptions">
              <p style={{ margin: 0, fontSize: "0.88rem", color: colors.muted }}>
                Leave, part-time weeks or any period where {person.name} works less than the usual{" "}
                {formatFte(person.base_capacity)} FTE. These override project assignments.
              </p>
              <TimeOffList person={person} today={today} />
              {canWritePeople && (
                <Button
                  icon={Plus}
                  onClick={() => setDialog("time-off")}
                  style={{ marginTop: "1rem" }}
                >
                  Add time off
                </Button>
              )}
            </SectionCard>
          }
        />
      </TabPanel>

      <TabPanel group="person" value="history" active={tab === "history"}>
        <SectionCard title="Past assignments" flush>
          {past.length === 0 ? (
            <p style={{ margin: 0, padding: "0 1.5rem 1.25rem", color: colors.muted }}>
              No past assignments yet.
            </p>
          ) : (
            <AssignmentList assignments={past} projectName={projectName} today={today} />
          )}
        </SectionCard>
      </TabPanel>

      {dialog === "profile" && (
        <PersonForm
          person={person}
          people={people}
          roles={roles}
          roleOptions={roleOptions}
          skillOptions={skillOptions}
          onClose={closeDialog}
          onSave={async (draft) => {
            await savePerson(draft, person.id);
            await refreshPerson();
            closeDialog();
          }}
        />
      )}
      {dialog === "assign" && (
        <AssignToProjectModal
          person={person}
          projects={projects}
          onClose={closeDialog}
          onAssigned={async (assignment) => {
            setAssignments((existing) => [...existing, assignment]);
            closeDialog();
            await refreshPerson();
          }}
        />
      )}
      {dialog === "skills" && (
        <SkillsModal
          person={person}
          skillOptions={skillOptions}
          onClose={closeDialog}
          onSaved={(saved) => {
            setPerson(saved);
            closeDialog();
          }}
        />
      )}
      {dialog === "time-off" && (
        <TimeOffModal
          person={person}
          onClose={closeDialog}
          onSaved={(saved) => {
            setPerson(saved);
            closeDialog();
          }}
        />
      )}
    </div>
  );
}

/** A card with an `h2` title and an optional header action; `flush` lets lists span the
 * card's full width. */
function SectionCard({
  title,
  action,
  flush,
  children,
}: {
  title: string;
  action?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Card style={{ padding: flush ? "1.4rem 0 0" : "1.4rem 1.5rem", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            margin: "0 0 1rem",
            padding: flush ? "0 1.5rem" : 0,
          }}
        >
          <h2 id={headingId} style={{ margin: 0 }}>
            {title}
          </h2>
          {action}
        </div>
        {children}
      </Card>
    </section>
  );
}

function AssignmentList({
  assignments,
  projectName,
  today,
}: {
  assignments: Assignment[];
  projectName: (projectId: string) => string;
  today: string;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {assignments.map((a) => (
        <li key={a.id} style={{ borderTop: `1px solid ${colors.border}` }}>
          <Link
            to={`/projects/${encodeURIComponent(a.project_id)}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.85rem 1.5rem",
              color: colors.text,
              textDecoration: "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {projectName(a.project_id)}
                {a.phase_id && (
                  <span style={{ fontWeight: 400, color: colors.muted }}> · {a.phase_id}</span>
                )}
              </div>
              <div
                className="mono"
                style={{ marginTop: 2, fontSize: "0.85rem", color: colors.muted }}
              >
                {formatSpan(a, today)} · {formatDuration(a.start, a.end)}
              </div>
            </div>
            <Pill tone="primary">{commitmentForRatio(a.ratio)}</Pill>
            <ChevronRight size={16} aria-hidden style={{ color: colors.muted, flexShrink: 0 }} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SkillLevels({ person }: { person: Person }) {
  if (person.skills.length === 0) {
    return <p style={{ color: colors.muted, margin: 0 }}>No skills recorded.</p>;
  }
  const skills = [...person.skills].sort((a, b) => b.level - a.level);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.9rem" }}>
      {skills.map((skill) => (
        <li key={skill.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
            <span style={{ fontWeight: 500 }}>{skill.id}</span>
            <span className="mono" style={{ fontSize: "0.88rem", color: colors.muted }}>
              {skill.level} / 5
            </span>
          </div>
          <div aria-hidden style={{ display: "flex", gap: 3, marginTop: 6 }}>
            {[0, 1, 2, 3, 4].map((step) => (
              <div
                key={step}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  background: colors.track,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(Math.max(skill.level - step, 0), 1) * 100}%`,
                    height: "100%",
                    background: colors.primary,
                  }}
                />
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TimeOffList({ person, today }: { person: Person; today: string }) {
  const entries = [
    ...person.vacations.map((v) => ({ ...v, label: "Time off" })),
    ...person.availability_windows.map((w) => ({ ...w, label: `${formatFte(w.ratio)} FTE` })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  if (entries.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0 }}>
      {entries.map((entry) => (
        <li
          key={`${entry.label}-${entry.start}-${entry.end}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <span className="mono" style={{ fontSize: "0.85rem" }}>
            {formatSpan(entry, today)}
          </span>
          <Pill tone={entry.label === "Time off" ? "warning" : "neutral"}>{entry.label}</Pill>
        </li>
      ))}
    </ul>
  );
}
