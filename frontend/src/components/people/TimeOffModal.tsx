import { useState } from "react";
import { Button, colors, Modal } from "@/components/common/ui";
import { AvailabilityEditor } from "@/components/editors/listEditors";
import { VacationPicker } from "@/components/people/VacationPicker";
import { errorMessage, peopleApi } from "@/services/api";
import type { Person } from "@/types";

/** Edits a person's days off and reduced-capacity periods, saved together. */
export function TimeOffModal({
  person,
  onClose,
  onSaved,
}: {
  person: Person;
  onClose: () => void;
  onSaved: (person: Person) => void;
}) {
  const [vacations, setVacations] = useState(person.vacations);
  const [windows, setWindows] = useState(person.availability_windows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await peopleApi.update(person.id, {
          ...person,
          vacations,
          availability_windows: windows,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Time off & exceptions"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <h3 style={{ margin: "0 0 0.25rem", fontSize: "1rem" }}>Days off</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: colors.muted }}>
        Leave counts as 0 FTE. Click a day to toggle it; shift-click to toggle a range.
      </p>
      <VacationPicker value={vacations} onChange={setVacations} />

      <h3 style={{ margin: "1.5rem 0 0.25rem", fontSize: "1rem" }}>Reduced capacity</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: colors.muted }}>
        Part-time weeks or other periods at a fixed FTE ratio (0–1) instead of the working pattern.
      </p>
      <AvailabilityEditor value={windows} onChange={setWindows} />

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
