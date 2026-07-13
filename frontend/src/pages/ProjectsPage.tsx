import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  Badge,
  Button,
  Card,
  colors,
  Field,
  inputStyle,
  Modal,
  priorityColors,
} from "@/components/common/ui";
import {
  DateRangesEditor,
  PersonMultiSelect,
  PhasesEditor,
  SkillReqsEditor,
  SquadsEditor,
} from "@/components/editors/listEditors";
import { knownSkillIds, useAppStore } from "@/store";
import type { Priority, Project } from "@/types";

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

type Draft = Omit<Project, "id">;

function emptyDraft(): Draft {
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

export default function ProjectsPage() {
  const {
    projects,
    people,
    isLoading,
    fetchProjects,
    fetchPeople,
    fetchSkills,
    saveProject,
    deleteProject,
  } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const [editing, setEditing] = useState<Project | "new" | null>(null);

  useEffect(() => {
    fetchProjects();
    fetchPeople();
    fetchSkills();
  }, [fetchProjects, fetchPeople, fetchSkills]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Projects</h1>
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Add project
        </Button>
      </div>

      {isLoading && projects.length === 0 ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <p>No projects found. Create your first project.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {projects.map((p) => (
            <Card key={p.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    <Badge color={priorityColors[p.priority]}>{p.priority}</Badge>
                  </div>
                  {p.description && (
                    <p style={{ margin: "0.5rem 0 0", color: colors.muted }}>{p.description}</p>
                  )}
                  <div
                    style={{
                      marginTop: "0.6rem",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    <Stat
                      label="Slots"
                      value={p.phases.length ? `${p.phases.length} phases` : String(p.n_slots)}
                    />
                    {p.skill_requirements.length > 0 && (
                      <Stat
                        label="Skills"
                        value={p.skill_requirements.map((s) => `${s.id}≥${s.min_level}`).join(", ")}
                      />
                    )}
                    {p.included_person_ids.length > 0 && (
                      <Stat label="Must include" value={String(p.included_person_ids.length)} />
                    )}
                    {p.excluded_person_ids.length > 0 && (
                      <Stat label="Excluded" value={String(p.excluded_person_ids.length)} />
                    )}
                    {p.squads.length > 0 && <Stat label="Squads" value={String(p.squads.length)} />}
                    {p.date_ranges.length > 0 && (
                      <Stat label="Date ranges" value={String(p.date_ranges.length)} />
                    )}
                  </div>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>
                  <Button onClick={() => setEditing(p)} style={{ marginRight: "0.4rem" }}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => confirm(`Delete ${p.name}?`) && deleteProject(p.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ProjectForm
          project={editing === "new" ? null : editing}
          people={people}
          skillOptions={skillOptions}
          onClose={() => setEditing(null)}
          onSave={async (draft, id) => {
            await saveProject(draft, id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ color: colors.muted }}>
      <strong style={{ color: colors.text }}>{label}:</strong> {value}
    </span>
  );
}

function ProjectForm({
  project,
  people,
  skillOptions,
  onClose,
  onSave,
}: {
  project: Project | null;
  people: import("@/types").Person[];
  skillOptions: string[];
  onClose: () => void;
  onSave: (draft: Draft, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    project ? { ...emptyDraft(), ...project } : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const usesPhases = draft.phases.length > 0;
  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
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
            style={inputStyle}
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
