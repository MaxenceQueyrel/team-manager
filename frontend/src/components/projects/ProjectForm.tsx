import { useState } from "react";
import { Button, Field, inputStyle, Modal, selectStyle } from "@/components/common/ui";
import {
  DateRangesEditor,
  PersonMultiSelect,
  PhasesEditor,
  SkillReqsEditor,
  SquadsEditor,
} from "@/components/editors/listEditors";
import type { Person, Priority, Project } from "@/types";

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export type ProjectDraft = Omit<Project, "id">;

function emptyDraft(): ProjectDraft {
  return {
    name: "",
    description: "",
    n_slots: 1,
    skill_requirements: [],
    excluded_person_ids: [],
    included_person_ids: [],
    squads: [],
    date_ranges: [],
    phases: [],
    priority: "medium",
  };
}

/** Modal form to create a project or edit its requirements, phases and constraints. */
export function ProjectForm({
  project,
  people,
  skillOptions,
  onClose,
  onSave,
}: {
  project: Project | null;
  people: Person[];
  skillOptions: string[];
  onClose: () => void;
  onSave: (draft: ProjectDraft, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() =>
    project ? { ...emptyDraft(), ...project } : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const usesPhases = draft.phases.length > 0;
  const set = <K extends keyof ProjectDraft>(key: K, val: ProjectDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: val }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft, project?.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={project ? `Edit ${project.name}` : "New project"}
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
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 1rem" }}>
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Priority">
          <select
            value={draft.priority}
            onChange={(e) => set("priority", e.target.value as Priority)}
            style={selectStyle}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      {!usesPhases && (
        <>
          <Field label="Number of slots" hint="People to assign to the project">
            <input
              type="number"
              min={1}
              value={draft.n_slots}
              onChange={(e) =>
                set("n_slots", Math.max(1, Math.round(parseFloat(e.target.value) || 1)))
              }
              style={{ ...inputStyle, maxWidth: 120 }}
            />
          </Field>

          <Field label="Skill requirements" hint="Minimum proficiency required, 0 to 5">
            <SkillReqsEditor
              value={draft.skill_requirements}
              onChange={(v) => set("skill_requirements", v)}
              skillOptions={skillOptions}
            />
          </Field>

          <Field label="Date ranges" hint="Calendar spans during which the project runs">
            <DateRangesEditor value={draft.date_ranges} onChange={(v) => set("date_ranges", v)} />
          </Field>
        </>
      )}

      <Field
        label="Phases"
        hint={
          usesPhases
            ? "Per-stage staffing overrides the project-level slots, skills and date ranges above."
            : "Add phases for multi-stage staffing (e.g. design → build → handover). Leave empty for a single team."
        }
      >
        <PhasesEditor
          value={draft.phases}
          onChange={(v) => set("phases", v)}
          skillOptions={skillOptions}
        />
      </Field>

      <Field label="Must include" hint="People that must be on the team">
        <PersonMultiSelect
          value={draft.included_person_ids}
          onChange={(v) => set("included_person_ids", v)}
          people={people}
        />
      </Field>

      <Field
        label="Excluded"
        hint="People that must not be assigned (when exclusions are respected)"
      >
        <PersonMultiSelect
          value={draft.excluded_person_ids}
          onChange={(v) => set("excluded_person_ids", v)}
          people={people}
        />
      </Field>

      <Field label="Squads" hint="Groups co-selected all-or-nothing">
        <SquadsEditor value={draft.squads} onChange={(v) => set("squads", v)} people={people} />
      </Field>
    </Modal>
  );
}
