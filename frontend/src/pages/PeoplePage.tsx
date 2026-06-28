import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { knownSkillIds, useAppStore } from "@/store";
import type { Person, Seniority } from "@/types";
import { Badge, Button, colors, Field, inputStyle, Modal, seniorityColors } from "@/components/common/ui";
import {
  AffinitiesEditor,
  AvailabilityEditor,
  SkillsEditor,
  TagSkillInput,
} from "@/components/editors/listEditors";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];

type Draft = Omit<Person, "id">;

function emptyDraft(): Draft {
  return {
    name: "",
    role: "",
    seniority: "mid",
    years_of_experience: 0,
    fte_capacity: 1,
    skills: [],
    availability_windows: [],
    preferences: [],
    growth_targets: [],
    affinities: {},
  };
}

export default function PeoplePage() {
  const { people, isLoading, fetchPeople, fetchSkills, savePerson, deletePerson } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const [editing, setEditing] = useState<Person | "new" | null>(null);

  useEffect(() => {
    fetchPeople();
    fetchSkills();
  }, [fetchPeople, fetchSkills]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>People</h1>
        <Button variant="primary" onClick={() => setEditing("new")}>+ Add person</Button>
      </div>

      {isLoading && people.length === 0 ? (
        <p>Loading…</p>
      ) : people.length === 0 ? (
        <p>No people found. Add your first team member.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${colors.border}` }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>Role</th>
              <th style={{ padding: "0.5rem" }}>Seniority</th>
              <th style={{ padding: "0.5rem" }}>Exp.</th>
              <th style={{ padding: "0.5rem" }}>FTE</th>
              <th style={{ padding: "0.5rem" }}>Skills</th>
              <th style={{ padding: "0.5rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${colors.light}` }}>
                <td style={{ padding: "0.5rem", fontWeight: 500 }}>{p.name}</td>
                <td style={{ padding: "0.5rem" }}>{p.role}</td>
                <td style={{ padding: "0.5rem" }}>
                  <Badge color={seniorityColors[p.seniority]}>{p.seniority}</Badge>
                </td>
                <td style={{ padding: "0.5rem" }}>{p.years_of_experience} yrs</td>
                <td style={{ padding: "0.5rem" }}>{(p.fte_capacity * 100).toFixed(0)}%</td>
                <td style={{ padding: "0.5rem", fontSize: "0.8rem", color: colors.muted }}>
                  {p.skills.map((s) => `${s.id} (${s.level})`).join(", ") || "—"}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  <Button onClick={() => setEditing(p)} style={{ marginRight: "0.4rem" }}>Edit</Button>
                  <Button variant="danger" onClick={() => confirm(`Delete ${p.name}?`) && deletePerson(p.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <PersonForm
          person={editing === "new" ? null : editing}
          people={people}
          skillOptions={skillOptions}
          onClose={() => setEditing(null)}
          onSave={async (draft, id) => {
            await savePerson(draft, id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PersonForm({
  person,
  people,
  skillOptions,
  onClose,
  onSave,
}: {
  person: Person | null;
  people: Person[];
  skillOptions: string[];
  onClose: () => void;
  onSave: (draft: Draft, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => (person ? { ...emptyDraft(), ...person } : emptyDraft()));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, val: Draft[K]) => setDraft((d) => ({ ...d, [key]: val }));

  const others = useMemo(() => people.filter((p) => p.id !== person?.id), [people, person]);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft, person?.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={person ? `Edit ${person.name}` : "New person"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !draft.name.trim()} onClick={submit}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
        <Field label="Name">
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Role">
          <input value={draft.role} onChange={(e) => set("role", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Seniority">
          <select value={draft.seniority} onChange={(e) => set("seniority", e.target.value as Seniority)} style={inputStyle}>
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.years_of_experience}
            onChange={(e) => set("years_of_experience", parseFloat(e.target.value) || 0)}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label={`FTE capacity — ${(draft.fte_capacity * 100).toFixed(0)}%`} hint="Baseline availability as a fraction of full-time">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.fte_capacity}
          onChange={(e) => set("fte_capacity", parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
      </Field>

      <Field label="Skills" hint="Proficiency level from 0 to 5">
        <SkillsEditor value={draft.skills} onChange={(v) => set("skills", v)} skillOptions={skillOptions} />
      </Field>

      <Field label="Preferences" hint="Skills the person prefers to work on">
        <TagSkillInput value={draft.preferences} onChange={(v) => set("preferences", v)} skillOptions={skillOptions} />
      </Field>

      <Field label="Growth targets" hint="Skills the person wants to grow in">
        <TagSkillInput value={draft.growth_targets} onChange={(v) => set("growth_targets", v)} skillOptions={skillOptions} />
      </Field>

      <Field label="Availability windows" hint="Exceptions to FTE capacity for specific date spans (e.g. leave)">
        <AvailabilityEditor value={draft.availability_windows} onChange={(v) => set("availability_windows", v)} />
      </Field>

      <Field label="Affinities" hint="Pairwise rapport with colleagues, from -5 to +5">
        <AffinitiesEditor value={draft.affinities} onChange={(v) => set("affinities", v)} people={others} />
      </Field>
    </Modal>
  );
}
