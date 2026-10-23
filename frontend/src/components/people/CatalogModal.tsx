import { useState } from "react";
import { Button, colors, Field, inputStyle, Modal } from "@/components/common/ui";
import type { Role, Skill } from "@/types";

export type CatalogKind = "role" | "skill";
export type CatalogItem = Role | Skill;

/** Modal to add a role or skill to the catalog, or to edit the description of `item`. */
export function CatalogModal({
  kind,
  items,
  item,
  onClose,
  onSave,
}: {
  kind: CatalogKind;
  items: CatalogItem[];
  item?: CatalogItem;
  onClose: () => void;
  onSave: (data: { id: string; description: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ id: item?.id ?? "", description: item?.description ?? "" });
  const [saving, setSaving] = useState(false);
  const normalizedId = draft.id.trim();
  const duplicate = !item && items.some((existing) => existing.id === normalizedId);
  const noun = kind === "role" ? "role" : "skill";

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
      title={item ? `Edit ${noun} ${item.id}` : `Add ${noun}`}
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
        hint={
          item
            ? "People and projects reference this id, so it can't be renamed."
            : "Use the id that will be referenced on people and projects."
        }
      >
        <input
          value={draft.id}
          disabled={item !== undefined}
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

      {!item && (
        <div style={{ fontSize: "0.8rem", color: colors.muted }}>
          {items.length === 0
            ? "No entries yet."
            : `Existing ${noun}s: ${items.map((existing) => existing.id).join(", ")}`}
        </div>
      )}
      {duplicate && (
        <p style={{ margin: "0.5rem 0 0", color: colors.danger, fontSize: "0.8rem" }}>
          That id already exists.
        </p>
      )}
    </Modal>
  );
}
