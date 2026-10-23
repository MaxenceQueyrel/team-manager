import { useState } from "react";
import { Button, colors, Modal } from "@/components/common/ui";
import { SkillsEditor } from "@/components/editors/listEditors";
import { errorMessage, peopleApi } from "@/services/api";
import type { Person } from "@/types";

export function SkillsModal({
  person,
  skillOptions,
  onClose,
  onSaved,
}: {
  person: Person;
  skillOptions: string[];
  onClose: () => void;
  onSaved: (person: Person) => void;
}) {
  const [skills, setSkills] = useState(person.skills);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await peopleApi.update(person.id, { ...person, skills }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit skills"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving || skills.some((s) => !s.id.trim())}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <SkillsEditor value={skills} onChange={setSkills} skillOptions={skillOptions} />
      {error && (
        <p
          role="alert"
          style={{ color: colors.danger, margin: "0.75rem 0 0", fontSize: "0.85rem" }}
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
