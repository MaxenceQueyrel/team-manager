import { useState } from "react";
import { Button, colors, Field, inputStyle, Modal, selectStyle } from "@/components/common/ui";
import {
  DateRangesEditor,
  PersonMultiSelect,
  PhasesEditor,
  SkillReqsEditor,
  SquadsEditor,
} from "@/components/editors/listEditors";
import { errorMessage } from "@/services/api";
import type { DateRange, Person, Priority, Project } from "@/types";

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export type ProjectDraft = Omit<Project, "id">;

function emptyDraft(): ProjectDraft {
  return {
    name: "",
    description: "",
    skill_requirements: [],
    excluded_person_ids: [],
    included_person_ids: [],
    squads: [],
    date_ranges: [],
    phases: [],
    start_window: null,
    priority: "medium",
    completed_at: null,
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
  const [error, setError] = useState<string | null>(null);
  const usesPhases = draft.phases.length > 0;
  const hasDates =
    draft.date_ranges.length > 0 || draft.phases.some((phase) => phase.date_range !== null);
  const set = <K extends keyof ProjectDraft>(key: K, val: ProjectDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: val }));
  const setStartWindow = (patch: Partial<DateRange>) => {
    const next = { ...(draft.start_window ?? { start: "", end: "" }), ...patch };
    set("start_window", next.start || next.end ? next : null);
  };

  const submit = async () => {
    const scopes = usesPhases
      ? draft.phases.map((phase) => phase.skill_requirements)
      : [draft.skill_requirements];
    if (scopes.some((requirements) => requirements.length === 0)) {
      setError(
        usesPhases
          ? "Add at least one skill requirement to every phase."
          : "Add at least one skill requirement.",
      );
      return;
    }
    if (scopes.some((requirements) => requirements.some((req) => !req.id.trim()))) {
      setError("Pick a skill for every skill requirement.");
      return;
    }
    if (draft.start_window && (!draft.start_window.start || !draft.start_window.end)) {
      setError("Fill in both earliest and latest start, or leave both empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, project?.id);
    } catch (e) {
      setError(errorMessage(e));
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
          <Field
            label="Skill requirements"
            hint="Per skill: the minimum level (0–5) to fill it, the FTE to staff (1 = one full-time person, 0.2 = one day per week) and the most people to split it across."
          >
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
            ? "Per-stage staffing overrides the project-level skills and date ranges above."
            : "Add phases for multi-stage staffing (e.g. design → build → handover). Leave empty for a single team."
        }
      >
        <PhasesEditor
          value={draft.phases}
          onChange={(v) => set("phases", v)}
          skillOptions={skillOptions}
        />
      </Field>

      {/* A saved window stays editable after its dates are removed so it can be cleared. */}
      <fieldset
        disabled={!hasDates && draft.start_window === null}
        style={{ border: "none", padding: 0, margin: 0 }}
      >
        <legend style={{ padding: 0, fontSize: "0.82rem", fontWeight: 600, marginBottom: 5 }}>
          Flexible start
        </legend>
        <div style={{ fontSize: "0.78rem", color: colors.muted, marginBottom: 5 }}>
          {hasDates
            ? "The optimizer tries a weekly start between these dates and moves the whole schedule with it. Leave both empty to keep the dates fixed."
            : draft.start_window
              ? "The project has no dates left to move. Clear the earliest and latest start, or add a date range back."
              : "Add a date range to the project or a phase before making its start flexible."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <Field label="Earliest start">
            <input
              type="date"
              value={draft.start_window?.start ?? ""}
              onChange={(e) => setStartWindow({ start: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Latest start">
            <input
              type="date"
              value={draft.start_window?.end ?? ""}
              onChange={(e) => setStartWindow({ end: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>
      </fieldset>

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

      {error && (
        <p role="alert" style={{ color: colors.danger, margin: 0 }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
