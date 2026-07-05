import type { AssignedMember, Person } from "@/types";
import { colors } from "@/components/common/ui";

/** Renders assigned members, grouped by phase when the assignment is phased. */
export function TeamMembers({ members, people }: { members: AssignedMember[]; people: Person[] }) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const roleOf = (id: string) => people.find((p) => p.id === id)?.role;

  const phases = [...new Set(members.map((m) => m.phase_id))];
  const isPhased = phases.length > 1 || (phases.length === 1 && phases[0] !== null);

  const renderMember = (m: AssignedMember, i: number) => (
    <li key={`${m.person_id}-${m.phase_id}-${i}`} style={{ marginBottom: 2 }}>
      {nameOf(m.person_id)}
      {roleOf(m.person_id) && <span style={{ color: colors.muted }}> ({roleOf(m.person_id)})</span>}
      {" — "}
      {(m.fte_allocation * 100).toFixed(0)}% FTE
    </li>
  );

  if (!isPhased) {
    return <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>{members.map(renderMember)}</ul>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {phases.map((phaseId) => (
        <div key={phaseId ?? "unassigned"}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: colors.primary, marginBottom: 2 }}>
            {phaseId ?? "Unassigned"}
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {members.filter((m) => m.phase_id === phaseId).map(renderMember)}
          </ul>
        </div>
      ))}
    </div>
  );
}
