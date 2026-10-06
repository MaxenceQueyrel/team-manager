import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { daysBetween, ratioColor } from "@/components/common/AvailabilityCalendar";
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
import { PersonForm } from "@/components/people/PersonForm";
import { peopleApi } from "@/services/api";
import { downloadBlob } from "@/services/download";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { AvailabilitySegment, PeopleImportSummary, Person, Role, Skill } from "@/types";

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

const FREE_HORIZON_DAYS = 30;

type CatalogKind = "role" | "skill";
type CatalogItem = Role | Skill;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function averageRatio(segments: AvailabilitySegment[]): number {
  let weighted = 0;
  let days = 0;
  for (const segment of segments) {
    const length = daysBetween(segment.start, segment.end) + 1;
    weighted += segment.ratio * length;
    days += length;
  }
  return days === 0 ? 0 : weighted / days;
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
    importPeople,
    createRole,
    createSkill,
  } = useAppStore();
  const roleOptions = useAppStore(useShallow(knownRoleIds));
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWritePeople = useAuthStore((s) => s.permissions.has("people:write"));
  const canDeletePeople = useAuthStore((s) => s.permissions.has("people:delete"));
  const canWriteRoles = useAuthStore((s) => s.permissions.has("roles:write"));
  const canWriteSkills = useAuthStore((s) => s.permissions.has("skills:write"));
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [catalogKind, setCatalogKind] = useState<CatalogKind | null>(null);
  const [importSummary, setImportSummary] = useState<PeopleImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [freeRatios, setFreeRatios] = useState<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPeople();
    fetchRoles();
    fetchSkills();
  }, [fetchPeople, fetchRoles, fetchSkills]);

  // Re-run whenever the roster is refetched so a saved FTE change shows up in the badge.
  useEffect(() => {
    if (people.length === 0) return;
    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + FREE_HORIZON_DAYS);
    peopleApi
      .availability(toISODate(today), toISODate(horizon))
      .then((availability) =>
        setFreeRatios(new Map(availability.map((a) => [a.person_id, averageRatio(a.segments)]))),
      )
      .catch((e) => setImportError(message(e)));
  }, [people]);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    try {
      setImportSummary(await importPeople(file));
    } catch (e) {
      setImportError(message(e));
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      downloadBlob(await peopleApi.exportCsv(), "people.csv");
    } catch (e) {
      setImportError(message(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {canWriteRoles && <Button onClick={() => setCatalogKind("role")}>+ Add role</Button>}
        {canWriteSkills && <Button onClick={() => setCatalogKind("skill")}>+ Add skill</Button>}
        {canWritePeople && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleImportFile(file);
              }}
            />
            <Button disabled={importing} onClick={() => fileInputRef.current?.click()}>
              {importing ? "Importing…" : "Import CSV"}
            </Button>
            <Button disabled={exporting} onClick={handleExport}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              + Add person
            </Button>
          </>
        )}
      </div>

      {importSummary && (
        <p style={{ color: colors.success, margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          Import complete — created {importSummary.created.length}
          {importSummary.skipped.length > 0 && (
            <>
              , skipped {importSummary.skipped.length} (already existing:{" "}
              {importSummary.skipped.join(", ")})
            </>
          )}
          .
          {(importSummary.created_roles.length > 0 || importSummary.created_skills.length > 0) && (
            <>
              {" "}
              Also added {importSummary.created_roles.length} new role
              {importSummary.created_roles.length === 1 ? "" : "s"} and{" "}
              {importSummary.created_skills.length} new skill
              {importSummary.created_skills.length === 1 ? "" : "s"} to the catalog.
            </>
          )}
        </p>
      )}
      {importError && (
        <p style={{ color: colors.danger, margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          {importError}
        </p>
      )}

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
          onAdd={canWriteRoles ? () => setCatalogKind("role") : undefined}
        />
        <CatalogCard
          title={`Skills (${skills.length})`}
          subtitle="Reusable skill ids for people and projects."
          items={skills}
          onAdd={canWriteSkills ? () => setCatalogKind("skill") : undefined}
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
              <th style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                Free next {FREE_HORIZON_DAYS} days
              </th>
              <th style={{ padding: "0.5rem" }}>Skills</th>
              <th style={{ padding: "0.5rem" }} />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const free = freeRatios.get(p.id);
              return (
                <tr key={p.id} style={{ borderBottom: `1px solid ${colors.light}` }}>
                  <td style={{ padding: "0.5rem", fontWeight: 500 }}>
                    <Link to={`/people/${p.id}`} style={{ color: colors.primary }}>
                      {p.name}
                    </Link>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{p.role}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <Badge color={seniorityColors[p.seniority]}>{p.seniority}</Badge>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{p.years_of_experience} yrs</td>
                  <td style={{ padding: "0.5rem" }}>{(p.fte_capacity * 100).toFixed(0)}%</td>
                  <td style={{ padding: "0.5rem" }}>
                    {free === undefined ? (
                      "—"
                    ) : (
                      <Badge color={ratioColor(free)}>{(free * 100).toFixed(0)}%</Badge>
                    )}
                  </td>
                  <td style={{ padding: "0.5rem", fontSize: "0.8rem", color: colors.muted }}>
                    {p.skills.map((s) => `${s.id} (${s.level})`).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    {canWritePeople && (
                      <Button onClick={() => setEditing(p)} style={{ marginRight: "0.4rem" }}>
                        Edit
                      </Button>
                    )}
                    {canDeletePeople && (
                      <Button
                        variant="danger"
                        onClick={() => confirm(`Delete ${p.name}?`) && deletePerson(p.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
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
  onAdd?: () => void;
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
        {onAdd && <Button onClick={onAdd}>Add</Button>}
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
