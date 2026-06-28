import { useId, useState } from "react";
import type {
  AvailabilityWindow,
  DateRange,
  Person,
  ProjectPhase,
  SkillLevel,
  SkillRequirement,
  Squad,
} from "@/types";
import { Button, colors, inputStyle } from "@/components/common/ui";

const rowStyle = { display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" } as const;

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      style={{
        border: `1px solid ${colors.borderStrong}`,
        background: "#fff",
        color: colors.danger,
        borderRadius: 6,
        width: 30,
        height: 30,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      ×
    </button>
  );
}

function SkillDatalist({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  );
}

export function SkillsEditor({
  value,
  onChange,
  skillOptions,
}: {
  value: SkillLevel[];
  onChange: (v: SkillLevel[]) => void;
  skillOptions: string[];
}) {
  const listId = useId();
  const update = (i: number, patch: Partial<SkillLevel>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div>
      <SkillDatalist id={listId} options={skillOptions} />
      {value.map((s, i) => (
        <div key={i} style={rowStyle}>
          <input
            list={listId}
            placeholder="skill id"
            value={s.id}
            onChange={(e) => update(i, { id: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            title="Proficiency level (0–5)"
            value={s.level}
            onChange={(e) => update(i, { level: num(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
          <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Button onClick={() => onChange([...value, { id: "", level: 3 }])}>+ Add skill</Button>
    </div>
  );
}

export function SkillReqsEditor({
  value,
  onChange,
  skillOptions,
}: {
  value: SkillRequirement[];
  onChange: (v: SkillRequirement[]) => void;
  skillOptions: string[];
}) {
  const listId = useId();
  const update = (i: number, patch: Partial<SkillRequirement>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div>
      <SkillDatalist id={listId} options={skillOptions} />
      {value.map((s, i) => (
        <div key={i} style={rowStyle}>
          <input
            list={listId}
            placeholder="skill id"
            value={s.id}
            onChange={(e) => update(i, { id: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            title="Minimum level (0–5)"
            value={s.min_level}
            onChange={(e) => update(i, { min_level: num(e.target.value) })}
            style={{ ...inputStyle, width: 90 }}
          />
          <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Button onClick={() => onChange([...value, { id: "", min_level: 3 }])}>+ Add requirement</Button>
    </div>
  );
}

export function DateRangesEditor({
  value,
  onChange,
}: {
  value: DateRange[];
  onChange: (v: DateRange[]) => void;
}) {
  const update = (i: number, patch: Partial<DateRange>) =>
    onChange(value.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  return (
    <div>
      {value.map((d, i) => (
        <div key={i} style={rowStyle}>
          <input type="date" value={d.start} onChange={(e) => update(i, { start: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ color: colors.muted }}>→</span>
          <input type="date" value={d.end} onChange={(e) => update(i, { end: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Button onClick={() => onChange([...value, { start: "", end: "" }])}>+ Add date range</Button>
    </div>
  );
}

export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: AvailabilityWindow[];
  onChange: (v: AvailabilityWindow[]) => void;
}) {
  const update = (i: number, patch: Partial<AvailabilityWindow>) =>
    onChange(value.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));

  return (
    <div>
      {value.map((w, i) => (
        <div key={i} style={rowStyle}>
          <input type="date" value={w.start} onChange={(e) => update(i, { start: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ color: colors.muted }}>→</span>
          <input type="date" value={w.end} onChange={(e) => update(i, { end: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            title="FTE ratio during window (0–1)"
            value={w.ratio}
            onChange={(e) => update(i, { ratio: num(e.target.value) })}
            style={{ ...inputStyle, width: 80 }}
          />
          <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Button onClick={() => onChange([...value, { start: "", end: "", ratio: 0.5 }])}>+ Add window</Button>
    </div>
  );
}

export function AffinitiesEditor({
  value,
  onChange,
  people,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  people: Person[]; // candidate counterparts (self already excluded)
}) {
  const entries = Object.entries(value);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const used = new Set(Object.keys(value));
  const available = people.filter((p) => !used.has(p.id));

  const setScore = (id: string, score: number) => onChange({ ...value, [id]: score });
  const remove = (id: string) => {
    const next = { ...value };
    delete next[id];
    onChange(next);
  };

  return (
    <div>
      {entries.map(([id, score]) => (
        <div key={id} style={rowStyle}>
          <span style={{ flex: 1, fontSize: "0.875rem" }}>{nameOf(id)}</span>
          <input
            type="number"
            min={-5}
            max={5}
            step={1}
            title="Affinity score (-5..+5)"
            value={score}
            onChange={(e) => setScore(id, num(e.target.value))}
            style={{ ...inputStyle, width: 90 }}
          />
          <RemoveButton onClick={() => remove(id)} />
        </div>
      ))}
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && setScore(e.target.value, 0)}
          style={{ ...inputStyle, maxWidth: 260 }}
        >
          <option value="">+ Add affinity with…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function TagSkillInput({
  value,
  onChange,
  skillOptions,
  placeholder = "type a skill id and press Enter",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  skillOptions: string[];
  placeholder?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: value.length ? "0.5rem" : 0 }}>
        {value.map((tag) => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: colors.primaryBg,
              color: colors.primary,
              borderRadius: 12,
              padding: "0.15rem 0.6rem",
              fontSize: "0.8rem",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              style={{ border: "none", background: "none", cursor: "pointer", color: colors.primary, fontSize: "1rem", lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <SkillDatalist id={listId} options={skillOptions} />
      <input
        list={listId}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        style={inputStyle}
      />
    </div>
  );
}

export function PersonMultiSelect({
  value,
  onChange,
  people,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  people: Person[];
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  if (people.length === 0) return <p style={{ color: colors.muted, fontSize: "0.85rem", margin: 0 }}>No people available.</p>;

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: "0.5rem",
        maxHeight: 160,
        overflow: "auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "0.25rem",
      }}
    >
      {people.map((p) => (
        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer" }}>
          <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
          {p.name}
        </label>
      ))}
    </div>
  );
}

export function SquadsEditor({
  value,
  onChange,
  people,
}: {
  value: Squad[];
  onChange: (v: Squad[]) => void;
  people: Person[];
}) {
  const update = (i: number, member_ids: string[]) =>
    onChange(value.map((s, idx) => (idx === i ? { member_ids } : s)));

  return (
    <div>
      {value.map((squad, i) => (
        <div key={i} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: "0.6rem", marginBottom: "0.6rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <strong style={{ fontSize: "0.85rem" }}>Squad {i + 1}</strong>
            <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
          </div>
          <PersonMultiSelect value={squad.member_ids} onChange={(ids) => update(i, ids)} people={people} />
        </div>
      ))}
      <Button onClick={() => onChange([...value, { member_ids: [] }])}>+ Add squad</Button>
    </div>
  );
}

export function PhasesEditor({
  value,
  onChange,
  skillOptions,
}: {
  value: ProjectPhase[];
  onChange: (v: ProjectPhase[]) => void;
  skillOptions: string[];
}) {
  const update = (i: number, patch: Partial<ProjectPhase>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div>
      {value.map((phase, i) => (
        <div key={i} style={{ border: `1px solid ${colors.borderStrong}`, borderRadius: 8, padding: "0.85rem", marginBottom: "0.85rem", background: colors.light }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.6rem" }}>
            <input
              placeholder="phase id (e.g. design)"
              value={phase.id}
              onChange={(e) => update(i, { id: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type="number"
              min={1}
              title="Slots for this phase"
              value={phase.n_slots}
              onChange={(e) => update(i, { n_slots: Math.max(1, Math.round(num(e.target.value))) })}
              style={{ ...inputStyle, width: 80 }}
            />
            <RemoveButton onClick={() => onChange(value.filter((_, idx) => idx !== i))} />
          </div>

          <div style={{ fontSize: "0.75rem", fontWeight: 600, margin: "0.25rem 0" }}>Skill requirements</div>
          <SkillReqsEditor
            value={phase.skill_requirements}
            onChange={(reqs) => update(i, { skill_requirements: reqs })}
            skillOptions={skillOptions}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", margin: "0.6rem 0 0.3rem" }}>
            <input
              type="checkbox"
              checked={phase.date_range !== null}
              onChange={(e) => update(i, { date_range: e.target.checked ? { start: "", end: "" } : null })}
            />
            Constrain to a date range
          </label>
          {phase.date_range && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="date"
                value={phase.date_range.start}
                onChange={(e) => update(i, { date_range: { ...phase.date_range!, start: e.target.value } })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ color: colors.muted }}>→</span>
              <input
                type="date"
                value={phase.date_range.end}
                onChange={(e) => update(i, { date_range: { ...phase.date_range!, end: e.target.value } })}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          )}
        </div>
      ))}
      <Button onClick={() => onChange([...value, { id: "", n_slots: 1, skill_requirements: [], date_range: null }])}>
        + Add phase
      </Button>
    </div>
  );
}
