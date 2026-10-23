import { Check, CircleAlert, CircleCheck, Plus, Sparkles, UserPlus, X } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Button,
  Card,
  colors,
  Field,
  IconButton,
  inputStyle,
  Pill,
  StackedFillBar,
  selectStyle,
} from "@/components/common/ui";
import {
  assignedFte,
  formatFte,
  formatSpan,
  fteByPerson,
  missingSkills,
  type StaffingLane,
} from "@/components/projects/staffing";
import { errorMessage } from "@/services/api";
import type { Assignment, Person, SkillRequirement } from "@/types";

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

const rowPadding = "0.95rem 1.5rem";

function joinRequirements(requirements: SkillRequirement[]): string {
  const parts = requirements.map((r) => `${r.id} ≥ ${r.min_level}`);
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function capitalize(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

/** One phase (or the whole project): FTE headline, a per-person stacked bar, the skill
 * requirements, the roster with each member's requirement matches, and the open slot. */
export function StaffingLaneCard({
  lane,
  title,
  people,
  today,
  onAssign,
  onRemove,
  onSuggest,
}: {
  lane: StaffingLane;
  title: string;
  people: Person[];
  today: string;
  onAssign: (data: Omit<Assignment, "id" | "project_id">) => Promise<void>;
  onRemove: (assignmentId: string) => Promise<void>;
  onSuggest?: () => void;
}) {
  const headingId = useId();
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const nameOf = (personId: string) => peopleById.get(personId)?.name ?? personId;
  const missing = missingSkills(lane, people);
  const fte = assignedFte(lane);
  const open = lane.nSlots === null ? 0 : Math.max(lane.nSlots - fte, 0);
  const roster = [...lane.assignments].sort((a, b) => a.start.localeCompare(b.start));
  const segments = [...fteByPerson(lane)].map(([personId, value]) => ({
    key: personId,
    label: nameOf(personId).split(" ")[0],
    value,
  }));

  const remove = async (assignmentId: string) => {
    setError(null);
    try {
      await onRemove(assignmentId);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.75rem 1rem",
    padding: rowPadding,
    borderTop: `1px solid ${colors.border}`,
  };

  return (
    <section aria-labelledby={headingId}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "1.25rem 1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 id={headingId} style={{ margin: 0 }}>
                {title}
              </h2>
              {lane.phaseId !== null && lane.dateRanges.length > 0 && (
                <div
                  className="mono"
                  style={{ marginTop: "0.2rem", fontSize: "0.8rem", color: colors.muted }}
                >
                  {lane.dateRanges.map((range) => formatSpan(range, today)).join(", ")}
                </div>
              )}
            </div>
            <div style={{ color: colors.muted, fontSize: "0.95rem" }}>
              <span
                className="mono"
                style={{ fontSize: "1.6rem", fontWeight: 600, color: colors.text }}
              >
                {formatFte(fte)}
              </span>{" "}
              {lane.nSlots === null ? "FTE" : `of ${lane.nSlots} FTE`}
            </div>
          </div>

          {lane.nSlots === null ? (
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: colors.muted }}>
              Assignments not tied to any current phase.
            </p>
          ) : (
            <div style={{ marginTop: "1rem" }}>
              <StackedFillBar segments={segments} total={lane.nSlots} legend />
            </div>
          )}

          {lane.skillRequirements.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginTop: "1rem",
                fontSize: "0.88rem",
                color: colors.muted,
              }}
            >
              <span>Requires</span>
              {lane.skillRequirements.map((req) => (
                <Pill key={req.id} tone="outline">
                  {req.id} <span className="mono">≥ {req.min_level}</span>
                </Pill>
              ))}
            </div>
          )}
        </div>

        {roster.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {roster.map((assignment) => {
              const person = peopleById.get(assignment.person_id);
              const name = nameOf(assignment.person_id);
              const details = [
                person?.role,
                person && capitalize(person.seniority),
                lane.nSlots === null && assignment.phase_id,
              ].filter(Boolean);
              return (
                <li key={assignment.id} style={rowStyle}>
                  <Avatar name={name} />
                  <div style={{ flex: "1 1 10rem", minWidth: 0 }}>
                    <Link
                      to={`/people/${encodeURIComponent(assignment.person_id)}`}
                      style={{ color: colors.text, fontWeight: 600 }}
                    >
                      {name}
                    </Link>
                    {details.length > 0 && (
                      <div style={{ fontSize: "0.85rem", color: colors.muted }}>
                        {details.join(" · ")}
                      </div>
                    )}
                  </div>
                  {person && lane.skillRequirements.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {lane.skillRequirements.map((req) => (
                        <SkillMatch key={req.id} person={person} requirement={req} />
                      ))}
                    </div>
                  )}
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" title={commitmentForRatio(assignment.ratio)}>
                      {formatFte(assignment.ratio)} FTE
                    </div>
                    <div className="mono" style={{ fontSize: "0.8rem", color: colors.muted }}>
                      {formatSpan(assignment, today)}
                    </div>
                  </div>
                  <IconButton
                    icon={X}
                    size="sm"
                    ariaLabel={`Remove ${name}`}
                    onClick={() => remove(assignment.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {lane.nSlots !== null && (
          <div
            style={{
              ...rowStyle,
              background:
                open > 0 || missing.length > 0
                  ? "color-mix(in srgb, var(--color-warning-tint) 40%, var(--color-surface))"
                  : colors.light,
            }}
          >
            {open > 0 || missing.length > 0 ? (
              <>
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: `1.5px dashed ${colors.warning}`,
                    color: colors.warning,
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} />
                </span>
                <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {open > 0 ? `${formatFte(open)} FTE still open` : "Skills not covered"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: colors.muted }}>
                    {missing.length > 0
                      ? `Needs ${joinRequirements(missing)}`
                      : lane.skillRequirements.length > 0
                        ? "Every required skill is covered"
                        : "No skill requirements"}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: "1 1 12rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: colors.success,
                  fontWeight: 500,
                }}
              >
                <CircleCheck size={18} aria-hidden />
                Fully staffed
              </div>
            )}
            {!assigning && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <Button
                  icon={UserPlus}
                  onClick={() => setAssigning(true)}
                  ariaLabel={`Assign person to ${lane.label}`}
                >
                  Assign person
                </Button>
                {onSuggest && (open > 0 || missing.length > 0) && (
                  <Button icon={Sparkles} onClick={onSuggest}>
                    Suggest people
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {assigning && (
          <div style={{ padding: rowPadding, borderTop: `1px solid ${colors.border}` }}>
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
          </div>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: colors.danger,
              margin: 0,
              padding: "0 1.5rem 1rem",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}

function SkillMatch({ person, requirement }: { person: Person; requirement: SkillRequirement }) {
  const level = person.skills.find((s) => s.id === requirement.id)?.level;
  if (level !== undefined && level >= requirement.min_level) {
    return (
      <Pill tone="success" icon={Check}>
        {requirement.id} <span className="mono">{level}</span>
      </Pill>
    );
  }
  return (
    <Pill tone="warning" icon={CircleAlert}>
      {level === undefined ? (
        `no ${requirement.id}`
      ) : (
        <>
          {requirement.id} <span className="mono">{level}</span>
        </>
      )}
    </Pill>
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
    <div>
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
