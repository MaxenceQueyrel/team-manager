import { useEffect, useMemo, useState } from "react";
import { Button, Badge, Card, colors, Field, Modal, inputStyle } from "@/components/common/ui";
import { assignmentsApi } from "@/services/api";
import type { Assignment, Person, Project } from "@/types";

const COMMITMENTS = [
  { value: "full-time", label: "Full-time", ratio: 1 },
  { value: "half-time", label: "Half-time", ratio: 0.5 },
  { value: "one-day-week", label: "One day/week", ratio: 0.2 },
  { value: "custom", label: "Custom ratio", ratio: 1 },
] as const;

type CommitmentValue = (typeof COMMITMENTS)[number]["value"];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(project: Project): { start: string; end: string } {
  const range = project.date_ranges[0] ?? project.phases.find((phase) => phase.date_range)?.date_range;
  if (range) return range;

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return { start: toISODate(start), end: toISODate(end) };
}

function commitmentForRatio(ratio: number): string {
  if (ratio === 1) return "Full-time";
  if (ratio === 0.5) return "Half-time";
  if (ratio === 0.2) return "One day/week";
  return `${Math.round(ratio * 100)}% FTE`;
}

function assignmentLabel(person: Person | undefined, assignment: Assignment): string {
  const name = person?.name ?? assignment.person_id;
  return `${name} · ${commitmentForRatio(assignment.ratio)}`;
}

export function ProjectAssignmentsModal({
  project,
  people,
  onClose,
}: {
  project: Project;
  people: Person[];
  onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id ?? "");
  const [commitment, setCommitment] = useState<CommitmentValue>("full-time");
  const [ratio, setRatio] = useState(1);
  const [range, setRange] = useState(() => defaultRange(project));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRange(defaultRange(project));
  }, [project]);

  useEffect(() => {
    if (!selectedPersonId && people[0]) setSelectedPersonId(people[0].id);
  }, [people, selectedPersonId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    assignmentsApi
      .list({ project_id: project.id })
      .then(setAssignments)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [project.id]);

  const roster = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const byPerson = assignmentLabel(people.find((p) => p.id === a.person_id), a).localeCompare(
          assignmentLabel(people.find((p) => p.id === b.person_id), b),
        );
        return byPerson || a.start.localeCompare(b.start);
      }),
    [assignments, people],
  );

  const preset = COMMITMENTS.find((item) => item.value === commitment);

  const submit = async () => {
    if (!selectedPersonId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await assignmentsApi.create({
        person_id: selectedPersonId,
        project_id: project.id,
        ratio: commitment === "custom" ? ratio : preset?.ratio ?? ratio,
        start: range.start,
        end: range.end,
        phase_id: null,
      });
      setAssignments((current) => [...current, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={project.name}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={saving || !selectedPersonId || !range.start || !range.end}
            onClick={submit}
          >
            {saving ? "Assigning…" : "Assign to project"}
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: colors.muted }}>
        {project.description || "No description provided."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "1rem" }}>
        <Card style={{ margin: 0, background: colors.light }}>
          <h3 style={{ marginTop: 0 }}>Assigned people</h3>
          {loading ? (
            <p style={{ color: colors.muted, marginBottom: 0 }}>Loading assignments…</p>
          ) : roster.length === 0 ? (
            <p style={{ color: colors.muted, marginBottom: 0 }}>No assignments yet.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {roster.map((assignment) => {
                const person = people.find((p) => p.id === assignment.person_id);
                return (
                  <li key={assignment.id} style={{ marginBottom: 6 }}>
                    <strong>{person?.name ?? assignment.person_id}</strong>
                    {person?.role && <span style={{ color: colors.muted }}> ({person.role})</span>}
                    {" · "}
                    <Badge color={colors.primary}>{commitmentForRatio(assignment.ratio)}</Badge>
                    <div style={{ fontSize: "0.8rem", color: colors.muted, marginTop: 2 }}>
                      {assignment.start} → {assignment.end}
                      {assignment.phase_id ? ` · ${assignment.phase_id}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div>
          <Field label="Person">
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a person</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Commitment">
            <select
              value={commitment}
              onChange={(e) => {
                const next = e.target.value as CommitmentValue;
                setCommitment(next);
                const selected = COMMITMENTS.find((item) => item.value === next);
                if (selected && next !== "custom") setRatio(selected.ratio);
              }}
              style={inputStyle}
            >
              {COMMITMENTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          {commitment === "custom" && (
            <Field label="Custom ratio" hint="Enter the fraction of FTE to reserve.">
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={ratio}
                onChange={(e) => setRatio(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                style={inputStyle}
              />
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="Start date">
              <input
                type="date"
                value={range.start}
                onChange={(e) => setRange((current) => ({ ...current, start: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={range.end}
                onChange={(e) => setRange((current) => ({ ...current, end: e.target.value }))}
                style={inputStyle}
              />
            </Field>
          </div>

          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: colors.muted }}>
            {commitment === "custom" ? commitmentForRatio(ratio) : preset?.label}
          </p>
          {error && <p style={{ color: colors.danger, margin: "0.75rem 0 0" }}>{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
