import { useMemo, useState } from "react";
import { Button, colors, Field, inputStyle, Modal, selectStyle } from "@/components/common/ui";
import { AffinitiesEditor, SkillsEditor, TagSkillInput } from "@/components/editors/listEditors";
import type { Person, Role, Seniority } from "@/types";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];

export type PersonDraft = Omit<Person, "id">;

function emptyDraft(): PersonDraft {
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

/** Modal form to create a person or edit their profile; availability windows are edited on the person detail page. */
export function PersonForm({
  person,
  people,
  roles,
  roleOptions,
  skillOptions,
  onClose,
  onSave,
}: {
  person: Person | null;
  people: Person[];
  roles: Role[];
  roleOptions: string[];
  skillOptions: string[];
  onClose: () => void;
  onSave: (draft: PersonDraft, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PersonDraft>(() =>
    person ? { ...emptyDraft(), ...person } : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PersonDraft>(key: K, val: PersonDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: val }));

  const others = useMemo(() => people.filter((p) => p.id !== person?.id), [people, person]);
  const roleLabel = (id: string) => {
    const description = roles.find((role) => role.id === id)?.description;
    return description ? `${id} — ${description}` : id;
  };

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
          <Button
            variant="primary"
            disabled={saving || !draft.name.trim() || !draft.role.trim()}
            onClick={submit}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Role" hint="Pick a reusable role from the catalog above.">
          <select
            value={draft.role}
            onChange={(e) => set("role", e.target.value)}
            style={selectStyle}
          >
            <option value="">Select a role</option>
            {roleOptions.map((roleId) => (
              <option key={roleId} value={roleId}>
                {roleLabel(roleId)}
              </option>
            ))}
          </select>
          {roleOptions.length === 0 && (
            <div style={{ marginTop: 4, fontSize: "0.75rem", color: colors.muted }}>
              Create a role first, then come back here to assign it.
            </div>
          )}
        </Field>
        <Field label="Seniority">
          <select
            value={draft.seniority}
            onChange={(e) => set("seniority", e.target.value as Seniority)}
            style={selectStyle}
          >
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
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

      <Field
        label={`FTE capacity — ${(draft.fte_capacity * 100).toFixed(0)}%`}
        hint="Baseline availability as a fraction of full-time"
      >
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

      <Field label="Skills" hint="Add skill ids from the catalog above.">
        <SkillsEditor
          value={draft.skills}
          onChange={(v) => set("skills", v)}
          skillOptions={skillOptions}
        />
      </Field>

      <Field label="Preferences" hint="Skills the person prefers to work on">
        <TagSkillInput
          value={draft.preferences}
          onChange={(v) => set("preferences", v)}
          skillOptions={skillOptions}
        />
      </Field>

      <Field label="Growth targets" hint="Skills the person wants to grow in">
        <TagSkillInput
          value={draft.growth_targets}
          onChange={(v) => set("growth_targets", v)}
          skillOptions={skillOptions}
        />
      </Field>

      <Field label="Affinities" hint="Pairwise rapport with colleagues, from -5 to +5">
        <AffinitiesEditor
          value={draft.affinities}
          onChange={(v) => set("affinities", v)}
          people={others}
        />
      </Field>
    </Modal>
  );
}
