import { isAxiosError } from "axios";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { daysBetween } from "@/components/common/AvailabilityCalendar";
import {
  Avatar,
  Button,
  Card,
  colors,
  fonts,
  PageHeader,
  Pill,
  StatTile,
  seniorityTones,
} from "@/components/common/ui";
import { AssignToProjectModal } from "@/components/people/AssignToProjectModal";
import {
  addDays,
  formatDay,
  formatDuration,
  formatSpan,
  todayISO,
} from "@/components/people/dates";
import { PersonForm } from "@/components/people/PersonForm";
import { SkillsModal } from "@/components/people/SkillsModal";
import { TimeOffModal } from "@/components/people/TimeOffModal";
import { WeeklyAvailability } from "@/components/people/WeeklyAvailability";
import { commitmentForRatio } from "@/components/projects/StaffingLaneCard";
import { buildLanes } from "@/components/projects/staffing";
import { assignmentsApi, errorMessage, peopleApi } from "@/services/api";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, Person, Project } from "@/types";

type Dialog = "profile" | "assign" | "skills" | "time-off" | null;

/** An FTE amount with at least one decimal: 1 → "1.0", 0.25 → "0.25". */
function formatFte(fte: number): string {
  const hundredths = Math.round(fte * 100);
  return (hundredths / 100).toFixed(hundredths % 10 === 0 ? 1 : 2);
}

function joinList(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Points at the open project whose skill requirements the person meets the most of. */
function skillMatchHint(person: Person, projects: Project[], today: string): string {
  let best: { project: Project; skills: string[] } | null = null;
  for (const project of projects) {
    const lanes = buildLanes(project, []);
    const open = lanes.some(
      (lane) => lane.dateRanges.length === 0 || lane.dateRanges.some((r) => r.end >= today),
    );
    if (!open) continue;
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
  const [freeNext30, setFreeNext30] = useState<number | null>(null);

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
    const start = todayISO();
    const end = addDays(start, 29);
    setFreeNext30(null);
    peopleApi
      .availability(start, end)
      .then((all) => {
        const segments = all.find((a) => a.person_id === person.id)?.segments ?? [];
        const dayRatios = segments.reduce(
          (sum, s) => sum + (daysBetween(s.start, s.end) + 1) * s.ratio,
          0,
        );
        setFreeNext30(dayRatios / 30);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [person]);

  const today = todayISO();
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
            <Pill tone={seniorityTones[person.seniority]}>{person.seniority}</Pill>
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
          label="Free next 30 days"
          mono
          value={freeNext30 === null ? "…" : formatFte(freeNext30)}
          unit="FTE"
          accent={freeNext30 === 0 ? "warning" : "success"}
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
            `ended ${formatDay(lastProject.end, lastProject.end.slice(0, 4) !== today.slice(0, 4))}`
          }
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "flex-start" }}>
        <div
          style={{
            flex: "999 1 520px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <WeeklyAvailability person={person} />
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
              <AssignmentList assignments={current} projectName={projectName} />
            )}
            {past.length > 0 && (
              <>
                <div
                  style={{
                    padding: "0.25rem 1.5rem 0.5rem",
                    fontSize: "0.85rem",
                    color: colors.muted,
                  }}
                >
                  Past
                </div>
                <AssignmentList assignments={past} projectName={projectName} />
              </>
            )}
          </SectionCard>
        </div>

        <div
          style={{
            flex: "1 1 320px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
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

          <SectionCard title="Time off & exceptions">
            <p style={{ margin: 0, fontSize: "0.88rem", color: colors.muted }}>
              Leave, part-time weeks or any period where {person.name} works less than the usual{" "}
              {formatFte(person.base_capacity)} FTE. These override project assignments.
            </p>
            <TimeOffList person={person} />
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
        </div>
      </div>

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
}: {
  assignments: Assignment[];
  projectName: (projectId: string) => string;
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
                {formatSpan(a.start, a.end)} · {formatDuration(a.start, a.end)}
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

function TimeOffList({ person }: { person: Person }) {
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
            {formatSpan(entry.start, entry.end)}
          </span>
          <Pill tone={entry.label === "Time off" ? "warning" : "neutral"}>{entry.label}</Pill>
        </li>
      ))}
    </ul>
  );
}
