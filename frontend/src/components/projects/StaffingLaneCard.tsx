import { isAxiosError } from "axios";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  colors,
  Field,
  inputStyle,
  selectStyle,
} from "@/components/common/ui";
import {
  assignedCount,
  fillColors,
  fillStatus,
  missingSkills,
  type StaffingLane,
} from "@/components/projects/staffing";
import type { Assignment, Person } from "@/types";

const COMMITMENTS = [
  { value: "full-time", label: "Full-time", ratio: 1 },
  { value: "half-time", label: "Half-time", ratio: 0.5 },
  { value: "one-day-week", label: "One day/week", ratio: 0.2 },
  { value: "custom", label: "Custom ratio", ratio: 1 },
] as const;

type CommitmentValue = (typeof COMMITMENTS)[number]["value"];

// The API reports business-rule failures (e.g. the FTE check) in `detail`; axios'
// own message would only say "Request failed with status code 400".
function errorMessage(e: unknown): string {
  if (isAxiosError(e) && typeof e.response?.data?.detail === "string") {
    return e.response.data.detail;
  }
  return e instanceof Error ? e.message : String(e);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(lane: StaffingLane): { start: string; end: string } {
  if (lane.dateRanges[0]) return lane.dateRanges[0];
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

/** One phase (or the whole project) with its requirements, fill status, roster and assign form. */
export function StaffingLaneCard({
  lane,
  people,
  onAssign,
  onRemove,
}: {
  lane: StaffingLane;
  people: Person[];
  onAssign: (data: Omit<Assignment, "id" | "project_id">) => Promise<void>;
  onRemove: (assignmentId: string) => Promise<void>;
}) {
  const headingId = useId();
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const missing = missingSkills(lane, people);
  const status = fillStatus(lane);
  const roster = [...lane.assignments].sort((a, b) => a.start.localeCompare(b.start));

  const remove = async (assignmentId: string) => {
    setError(null);
    try {
      await onRemove(assignmentId);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <h3 id={headingId} style={{ margin: 0, fontSize: "1rem" }}>
            {lane.label}
          </h3>
          {lane.nSlots !== null && (
            <Badge color={fillColors[status]}>
              {assignedCount(lane)} / {lane.nSlots} · {status}
            </Badge>
          )}
        </div>

        {lane.nSlots === null ? (
          <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: colors.muted }}>
            Assignments not tied to any current phase.
          </p>
        ) : (
          <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: colors.muted }}>
            <div>
              <strong style={{ color: colors.text }}>Slots:</strong> {lane.nSlots}
              {lane.skillRequirements.length > 0 && (
                <>
                  {" · "}
                  <strong style={{ color: colors.text }}>Skills:</strong>{" "}
                  {lane.skillRequirements.map((s) => `${s.id} ≥ ${s.min_level}`).join(", ")}
                </>
              )}
              {lane.dateRanges.length > 0 && (
                <>
                  {" · "}
                  <strong style={{ color: colors.text }}>Dates:</strong>{" "}
                  {lane.dateRanges.map((r) => `${r.start} → ${r.end}`).join(", ")}
                </>
              )}
            </div>
            {missing.length > 0 && (
              <div style={{ color: colors.danger, marginTop: 2 }}>
                Missing skills: {missing.map((s) => `${s.id} ≥ ${s.min_level}`).join(", ")}
              </div>
            )}
          </div>
        )}

        {roster.length === 0 ? (
          <p style={{ margin: "0.75rem 0 0", color: colors.muted, fontSize: "0.875rem" }}>
            No one assigned yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
            {roster.map((assignment) => {
              const person = people.find((p) => p.id === assignment.person_id);
              const name = person?.name ?? assignment.person_id;
              return (
                <li
                  key={assignment.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.4rem 0",
                    borderTop: `1px solid ${colors.light}`,
                    fontSize: "0.875rem",
                  }}
                >
                  <div>
                    <Link
                      to={`/people/${encodeURIComponent(assignment.person_id)}`}
                      style={{ color: colors.primary, fontWeight: 600 }}
                    >
                      {name}
                    </Link>
                    {person?.role && <span style={{ color: colors.muted }}> ({person.role})</span>}
                    {" · "}
                    <Badge color={colors.primary}>{commitmentForRatio(assignment.ratio)}</Badge>
                    <div style={{ fontSize: "0.8rem", color: colors.muted, marginTop: 2 }}>
                      {assignment.start} → {assignment.end}
                      {lane.nSlots === null && assignment.phase_id && ` · ${assignment.phase_id}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    ariaLabel={`Remove ${name}`}
                    onClick={() => remove(assignment.id)}
                    style={{ color: colors.danger }}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {lane.nSlots !== null &&
          (assigning ? (
            <AssignForm
              lane={lane}
              people={people}
              onCancel={() => {
                setAssigning(false);
                setError(null);
              }}
              onSubmit={async (data) => {
                setError(null);
                try {
                  await onAssign(data);
                  setAssigning(false);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            />
          ) : (
            <Button
              onClick={() => setAssigning(true)}
              ariaLabel={`Assign person to ${lane.label}`}
              style={{ marginTop: "0.75rem" }}
            >
              + Assign person
            </Button>
          ))}

        {error && (
          <p
            role="alert"
            style={{ color: colors.danger, margin: "0.5rem 0 0", fontSize: "0.85rem" }}
          >
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}

function AssignForm({
  lane,
  people,
  onCancel,
  onSubmit,
}: {
  lane: StaffingLane;
  people: Person[];
  onCancel: () => void;
  onSubmit: (data: Omit<Assignment, "id" | "project_id">) => Promise<void>;
}) {
  const [personId, setPersonId] = useState("");
  const [commitment, setCommitment] = useState<CommitmentValue>("full-time");
  const [ratio, setRatio] = useState(1);
  const [range, setRange] = useState(() => defaultRange(lane));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        person_id: personId,
        ratio,
        start: range.start,
        end: range.end,
        phase_id: lane.phaseId,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.85rem",
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        background: colors.light,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.75rem" }}>
        <Field label="Person">
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            style={selectStyle}
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
              const preset = COMMITMENTS.find((item) => item.value === next);
              if (preset && next !== "custom") setRatio(preset.ratio);
            }}
            style={selectStyle}
          >
            {COMMITMENTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
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
      {commitment === "custom" && (
        <Field label="Custom ratio" hint="Fraction of FTE to reserve.">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={ratio}
            onChange={(e) => setRatio(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            style={{ ...inputStyle, maxWidth: 120 }}
          />
        </Field>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={saving || !personId || !range.start || !range.end}
          onClick={submit}
        >
          {saving ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
