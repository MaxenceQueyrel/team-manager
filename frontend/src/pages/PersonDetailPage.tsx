import { isAxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { AvailabilityCalendar, AvailabilityLegend } from "@/components/common/AvailabilityCalendar";
import {
  Badge,
  Button,
  Card,
  colors,
  Field,
  inputStyle,
  seniorityColors,
} from "@/components/common/ui";
import { AvailabilityEditor } from "@/components/editors/listEditors";
import { PersonForm } from "@/components/people/PersonForm";
import { assignmentsApi, peopleApi } from "@/services/api";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, AvailabilitySegment, AvailabilityWindow, Person, Project } from "@/types";

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const today = new Date();
  const later = new Date(today);
  later.setDate(later.getDate() + 90);
  return { start: toISODate(today), end: toISODate(later) };
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [{ start, end }, setRange] = useState(defaultRange);
  const [segments, setSegments] = useState<AvailabilitySegment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [savingWindows, setSavingWindows] = useState(false);

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
        else setError(message(e));
      });
    assignmentsApi
      .list({ person_id: id })
      .then(setAssignments)
      .catch((e) => setError(message(e)));
  }, [id]);

  useEffect(() => {
    setWindows(person?.availability_windows ?? []);
  }, [person]);

  // Depends on `person` so the timeline refreshes after windows or FTE capacity are saved.
  useEffect(() => {
    if (!person) return;
    if (start > end) {
      setError("Start date must not be after the end date.");
      return;
    }
    setError(null);
    peopleApi
      .availability(start, end)
      .then((all) => setSegments(all.find((a) => a.person_id === person.id)?.segments ?? []))
      .catch((e) => setError(message(e)));
  }, [person, start, end]);

  const today = toISODate(new Date());
  const { current, past } = useMemo(() => {
    const sorted = [...assignments].sort((a, b) => a.start.localeCompare(b.start));
    return {
      current: sorted.filter((a) => a.end >= today),
      past: sorted.filter((a) => a.end < today),
    };
  }, [assignments, today]);

  const windowsDirty =
    person !== null && JSON.stringify(windows) !== JSON.stringify(person.availability_windows);

  const saveWindows = async () => {
    if (!person) return;
    setSavingWindows(true);
    setError(null);
    try {
      setPerson(await peopleApi.update(person.id, { ...person, availability_windows: windows }));
    } catch (e) {
      setError(message(e));
    } finally {
      setSavingWindows(false);
    }
  };

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

  return (
    <div>
      <Link to="/people" style={{ fontSize: "0.85rem", color: colors.muted }}>
        ← People
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          margin: "0.5rem 0 1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>{person.name}</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginTop: "0.4rem",
              color: colors.muted,
              fontSize: "0.9rem",
            }}
          >
            <span>{person.role}</span>
            <Badge color={seniorityColors[person.seniority]}>{person.seniority}</Badge>
            <span>{(person.fte_capacity * 100).toFixed(0)}% FTE</span>
          </div>
        </div>
        {canWritePeople && <Button onClick={() => setEditingProfile(true)}>Edit profile</Button>}
      </div>

      {error && <p style={{ color: colors.danger, margin: "0 0 1rem" }}>{error}</p>}

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Availability & workload</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <Field label="From">
            <input
              type="date"
              value={start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
          <AvailabilityLegend />
        </div>
        <AvailabilityCalendar
          start={start}
          end={end}
          rows={[{ id: person.id, label: person.name, segments }]}
          overlays={[]}
        />

        <h3 style={{ margin: "1.5rem 0 0.5rem", fontSize: "1rem" }}>Assignments</h3>
        {current.length === 0 && past.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0 }}>Not assigned to any project.</p>
        ) : (
          <>
            {current.length === 0 ? (
              <p style={{ color: colors.muted, margin: 0 }}>No current or upcoming assignments.</p>
            ) : (
              <AssignmentsTable assignments={current} projects={projects} />
            )}
            {past.length > 0 && (
              <details style={{ marginTop: "0.75rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: colors.muted }}>
                  Past assignments ({past.length})
                </summary>
                <AssignmentsTable assignments={past} projects={projects} />
              </details>
            )}
          </>
        )}

        <h3 style={{ margin: "1.5rem 0 0.25rem", fontSize: "1rem" }}>Availability windows</h3>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: colors.muted }}>
          Exceptions to FTE capacity for specific date spans (e.g. leave). They take precedence over
          assignments.
        </p>
        {canWritePeople ? (
          <>
            <AvailabilityEditor value={windows} onChange={setWindows} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              {windowsDirty && (
                <Button onClick={() => setWindows(person.availability_windows)}>Discard</Button>
              )}
              <Button
                variant="primary"
                disabled={!windowsDirty || savingWindows}
                onClick={saveWindows}
              >
                {savingWindows ? "Saving…" : "Save windows"}
              </Button>
            </div>
          </>
        ) : person.availability_windows.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0 }}>None.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
            {person.availability_windows.map((w) => (
              <li key={`${w.start}-${w.end}`}>
                {w.start} → {w.end}: {(w.ratio * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Skills</h2>
        {person.skills.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0 }}>No skills recorded.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {person.skills.map((s) => (
              <Badge key={s.id} color={colors.primary}>
                {s.id} · {s.level}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {editingProfile && (
        <PersonForm
          person={person}
          people={people}
          roles={roles}
          roleOptions={roleOptions}
          skillOptions={skillOptions}
          onClose={() => setEditingProfile(false)}
          onSave={async (draft) => {
            await savePerson(draft, person.id);
            setPerson(await peopleApi.get(person.id));
            setEditingProfile(false);
          }}
        />
      )}
    </div>
  );
}

function AssignmentsTable({
  assignments,
  projects,
}: {
  assignments: Assignment[];
  projects: Project[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: `2px solid ${colors.border}` }}>
          <th style={{ padding: "0.4rem" }}>Project</th>
          <th style={{ padding: "0.4rem" }}>Phase</th>
          <th style={{ padding: "0.4rem" }}>Dates</th>
          <th style={{ padding: "0.4rem" }}>FTE</th>
        </tr>
      </thead>
      <tbody>
        {assignments.map((a) => (
          <tr key={a.id} style={{ borderBottom: `1px solid ${colors.light}` }}>
            <td style={{ padding: "0.4rem" }}>
              <Link
                to={`/projects/${encodeURIComponent(a.project_id)}`}
                style={{ color: colors.primary }}
              >
                {projects.find((p) => p.id === a.project_id)?.name ?? a.project_id}
              </Link>
            </td>
            <td style={{ padding: "0.4rem" }}>{a.phase_id ?? "—"}</td>
            <td style={{ padding: "0.4rem", whiteSpace: "nowrap" }}>
              {a.start} → {a.end}
            </td>
            <td style={{ padding: "0.4rem" }}>{(a.ratio * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
