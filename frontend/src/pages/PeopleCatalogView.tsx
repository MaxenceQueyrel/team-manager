import { CircleAlert, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { Button, Card, colors, Menu, type MenuItem } from "@/components/common/ui";
import { type CatalogItem, type CatalogKind, CatalogModal } from "@/components/people/CatalogModal";
import { formatHeadcount } from "@/components/projects/staffing";
import { errorMessage, rolesApi, skillsApi } from "@/services/api";
import { useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";

const headerCell = {
  padding: "0.6rem 0.75rem",
  textAlign: "left",
  fontSize: "0.82rem",
  fontWeight: 500,
  color: colors.muted,
  borderBottom: `1px solid ${colors.border}`,
} as const;

const bodyCell = {
  padding: "0.7rem 0.75rem",
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: "top",
} as const;

/** The "Roles & skills" tab: the full role and skill catalogs with their descriptions. */
export default function PeopleCatalogView() {
  const { people, roles, skills, createRole, createSkill, fetchRoles, fetchSkills } = useAppStore();
  const canWriteRoles = useAuthStore((s) => s.permissions.has("roles:write"));
  const canDeleteRoles = useAuthStore((s) => s.permissions.has("roles:delete"));
  const canWriteSkills = useAuthStore((s) => s.permissions.has("skills:write"));
  const canDeleteSkills = useAuthStore((s) => s.permissions.has("skills:delete"));
  const [editing, setEditing] = useState<{ kind: CatalogKind; item?: CatalogItem } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (
    { kind, item }: { kind: CatalogKind; item?: CatalogItem },
    data: { id: string; description: string },
  ) => {
    if (item) {
      await (kind === "role" ? rolesApi : skillsApi).update(item.id, data);
      await (kind === "role" ? fetchRoles() : fetchSkills());
    } else if (kind === "role") {
      await createRole(data);
    } else {
      await createSkill(data);
    }
    setEditing(null);
  };

  const remove = async (kind: CatalogKind, id: string, usedBy: number) => {
    const inUse = usedBy > 0 ? ` It is still set on ${formatHeadcount(usedBy)}.` : "";
    if (!confirm(`Delete ${kind} ${id}?${inUse}`)) return;
    setError(null);
    try {
      await (kind === "role" ? rolesApi : skillsApi).delete(id);
      await (kind === "role" ? fetchRoles() : fetchSkills());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            marginBottom: "1rem",
            padding: "0.6rem 0.9rem",
            borderRadius: "var(--radius)",
            background: colors.dangerBg,
            color: colors.danger,
            fontSize: "0.875rem",
          }}
        >
          <CircleAlert size={16} aria-hidden />
          {error}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        <CatalogSection
          kind="role"
          title="Roles"
          subtitle="Labels you pick from on the person form."
          items={roles}
          usage={(id) => people.filter((p) => p.role === id).length}
          canWrite={canWriteRoles}
          canDelete={canDeleteRoles}
          onAdd={() => setEditing({ kind: "role" })}
          onEdit={(item) => setEditing({ kind: "role", item })}
          onDelete={(id, usedBy) => remove("role", id, usedBy)}
        />
        <CatalogSection
          kind="skill"
          title="Skills"
          subtitle="Skill ids you rate people on and require on projects."
          items={skills}
          usage={(id) => people.filter((p) => p.skills.some((s) => s.id === id)).length}
          canWrite={canWriteSkills}
          canDelete={canDeleteSkills}
          onAdd={() => setEditing({ kind: "skill" })}
          onEdit={(item) => setEditing({ kind: "skill", item })}
          onDelete={(id, usedBy) => remove("skill", id, usedBy)}
        />
      </div>

      {editing && (
        <CatalogModal
          kind={editing.kind}
          items={editing.kind === "role" ? roles : skills}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSave={(data) => save(editing, data)}
        />
      )}
    </div>
  );
}

function CatalogSection({
  kind,
  title,
  subtitle,
  items,
  usage,
  canWrite,
  canDelete,
  onAdd,
  onEdit,
  onDelete,
}: {
  kind: CatalogKind;
  title: string;
  subtitle: string;
  items: CatalogItem[];
  usage: (id: string) => number;
  canWrite: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (item: CatalogItem) => void;
  onDelete: (id: string, usedBy: number) => void;
}) {
  const noun = kind === "role" ? "Role" : "Skill";
  return (
    <Card style={{ padding: "1.25rem 1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            {title}{" "}
            <span className="mono" style={{ color: colors.muted, fontSize: "0.9rem" }}>
              {items.length}
            </span>
          </h3>
          <p style={{ margin: "0.3rem 0 0", color: colors.muted, fontSize: "0.88rem" }}>
            {subtitle}
          </p>
        </div>
        {canWrite && (
          <Button icon={Plus} ariaLabel={`Add ${kind}`} onClick={onAdd}>
            {noun}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ margin: 0, color: colors.muted, fontSize: "0.9rem" }}>No {kind}s yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th style={headerCell}>{noun}</th>
                <th style={headerCell}>Description</th>
                <th style={{ ...headerCell, textAlign: "right" }}>People</th>
                <th style={headerCell} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const usedBy = usage(item.id);
                const actions: MenuItem[] = [];
                if (canWrite)
                  actions.push({
                    label: "Edit description",
                    icon: Pencil,
                    onSelect: () => onEdit(item),
                  });
                if (canDelete)
                  actions.push({
                    label: "Delete",
                    icon: Trash,
                    danger: true,
                    onSelect: () => onDelete(item.id, usedBy),
                  });
                return (
                  <tr key={item.id}>
                    <td style={{ ...bodyCell, fontWeight: 500, overflowWrap: "anywhere" }}>
                      {item.id}
                    </td>
                    <td
                      style={{ ...bodyCell, color: item.description ? colors.text : colors.subtle }}
                    >
                      {item.description || "—"}
                    </td>
                    <td
                      className="mono"
                      style={{
                        ...bodyCell,
                        textAlign: "right",
                        color: usedBy === 0 ? colors.warningText : colors.text,
                      }}
                    >
                      {usedBy}
                    </td>
                    <td style={{ ...bodyCell, width: 1, padding: "0.4rem 0.25rem" }}>
                      {actions.length > 0 && (
                        <Menu items={actions} ariaLabel={`Actions for ${kind} ${item.id}`} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
