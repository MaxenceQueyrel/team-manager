import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  Badge,
  Button,
  Card,
  colors,
  Field,
  inputStyle,
  Modal,
  seniorityColors,
} from "@/components/common/ui";
import {
  AffinitiesEditor,
  AvailabilityEditor,
  SkillsEditor,
  TagSkillInput,
} from "@/components/editors/listEditors";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import type { Person, Role, Seniority, Skill } from "@/types";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];

type Draft = Omit<Person, "id">;
type CatalogKind = "role" | "skill";
type CatalogItem = Role | Skill;

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
  const {
    people,
    roles,
    skills,
    isLoading,
    fetchPeople,
    fetchRoles,
    fetchSkills,
    savePerson,
    deletePerson,
    createRole,
    createSkill,
  } = useAppStore();
  const roleOptions = useAppStore(useShallow(knownRoleIds));
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [catalogKind, setCatalogKind] = useState<CatalogKind | null>(null);

  useEffect(() => {
    fetchPeople();
    fetchRoles();
    fetchSkills();
  }, [fetchPeople, fetchRoles, fetchSkills]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>People</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button onClick={() => setCatalogKind("role")}>+ Add role</Button>
          <Button onClick={() => setCatalogKind("skill")}>+ Add skill</Button>
          <Button variant="primary" onClick={() => setEditing("new")}>
            + Add person
          </Button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <CatalogCard
          title={`Roles (${roles.length})`}
          subtitle="Reusable labels people can select on the person form."
          items={roles}
          onAdd={() => setCatalogKind("role")}
        />
        <CatalogCard
          title={`Skills (${skills.length})`}
          subtitle="Reusable skill ids for people and projects."
          items={skills}
          onAdd={() => setCatalogKind("skill")}
        />
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
              <th style={{ padding: "0.5rem" }} />
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
                  <Button onClick={() => setEditing(p)} style={{ marginRight: "0.4rem" }}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => confirm(`Delete ${p.name}?`) && deletePerson(p.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {catalogKind && (
        <CatalogModal
          kind={catalogKind}
          items={catalogKind === "role" ? roles : skills}
          onClose={() => setCatalogKind(null)}
          onSave={async (data) => {
            if (catalogKind === "role") {
              await createRole(data);
            } else {
              await createSkill(data);
            }
            setCatalogKind(null);
          }}
        />
      )}

      {editing && (
        <PersonForm
          person={editing === "new" ? null : editing}
          people={people}
          roles={roles}
          roleOptions={roleOptions}
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

function CatalogCard({
  title,
  subtitle,
  items,
  onAdd,
}: {
  title: string;
  subtitle: string;
  items: CatalogItem[];
  onAdd: () => void;
}) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p style={{ margin: "0.35rem 0 0", color: colors.muted, fontSize: "0.85rem" }}>
            {subtitle}
          </p>
        </div>
        <Button onClick={onAdd}>Add</Button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.9rem" }}>
        {items.length === 0 ? (
          <span style={{ color: colors.muted, fontSize: "0.85rem" }}>None yet.</span>
        ) : (
          items.slice(0, 10).map((item) => (
            <Badge key={item.id} color={colors.primary}>
              {item.id}
            </Badge>
          ))
        )}
      </div>
      {items.length > 10 && (
        <p style={{ margin: "0.6rem 0 0", color: colors.muted, fontSize: "0.8rem" }}>
          + {items.length - 10} more
        </p>
      )}
    </Card>
  );
}

function CatalogModal({
  kind,
  items,
  onClose,
  onSave,
}: {
  kind: CatalogKind;
  items: CatalogItem[];
  onClose: () => void;
  onSave: (data: { id: string; description: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ id: "", description: "" });
  const [saving, setSaving] = useState(false);
  const normalizedId = draft.id.trim();
  const duplicate = items.some((item) => item.id === normalizedId);

  useEffect(() => {
    setDraft({ id: "", description: "" });
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ id: normalizedId, description: draft.description.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={kind === "role" ? "Add role" : "Add skill"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving || !normalizedId || duplicate}
            onClick={submit}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field
        label={kind === "role" ? "Role id" : "Skill id"}
        hint="Use the id that will be referenced on people and projects."
      >
        <input
          value={draft.id}
          onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
          style={inputStyle}
        />
      </Field>

      <Field label="Description" hint="Optional label or note for the catalog.">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <div style={{ fontSize: "0.8rem", color: colors.muted }}>
        {items.length === 0
          ? "No entries yet."
          : `Existing ${kind === "role" ? "roles" : "skills"}: ${items.map((item) => item.id).join(", ")}`}
      </div>
      {duplicate && (
        <p style={{ margin: "0.5rem 0 0", color: colors.danger, fontSize: "0.8rem" }}>
          That id already exists.
        </p>
      )}
    </Modal>
  );
}

function PersonForm({
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
  onSave: (draft: Draft, id?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    person ? { ...emptyDraft(), ...person } : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
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
            style={inputStyle}
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
            style={inputStyle}
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

      <Field
        label="Availability windows"
        hint="Exceptions to FTE capacity for specific date spans (e.g. leave)"
      >
        <AvailabilityEditor
          value={draft.availability_windows}
          onChange={(v) => set("availability_windows", v)}
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
