import { colors } from "@/components/common/ui";
import type { AssignedMember, Person } from "@/types";

type MemberStatus = "added" | "dropped" | null;

const memberKey = (m: AssignedMember) => `${m.person_id}|${m.phase_id}`;

/** Renders assigned members, grouped by phase when the assignment is phased.
 *
 * When `baseline` is given, members absent from it are marked "added" and baseline
 * members absent from `members` are listed struck through as "dropped".
 */
export function TeamMembers({
  members,
  people,
  baseline,
}: {
  members: AssignedMember[];
  people: Person[];
  baseline?: AssignedMember[];
}) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const roleOf = (id: string) => people.find((p) => p.id === id)?.role;

  const baselineKeys = new Set(baseline?.map(memberKey));
  const memberKeys = new Set(members.map(memberKey));
  const rows: { member: AssignedMember; status: MemberStatus }[] = [
    ...members.map((m) => ({
      member: m,
      status: baseline && !baselineKeys.has(memberKey(m)) ? ("added" as const) : null,
    })),
    ...(baseline ?? [])
      .filter((m) => !memberKeys.has(memberKey(m)))
      .map((m) => ({ member: m, status: "dropped" as const })),
  ];

  const phases = [...new Set(rows.map((r) => r.member.phase_id))];
  const isPhased = phases.length > 1 || (phases.length === 1 && phases[0] !== null);

  const renderRow = ({ member: m, status }: (typeof rows)[number], i: number) => (
    <li
      key={`${m.person_id}-${m.phase_id}-${i}`}
      style={{
        marginBottom: 2,
        color: status === "dropped" ? colors.muted : undefined,
      }}
    >
      <span style={{ textDecoration: status === "dropped" ? "line-through" : undefined }}>
        {nameOf(m.person_id)}
        {roleOf(m.person_id) && (
          <span style={{ color: colors.muted }}> ({roleOf(m.person_id)})</span>
        )}
        {" — "}
        {(m.fte_allocation * 100).toFixed(0)}% FTE
      </span>
      {status && (
        <span
          style={{
            marginLeft: 6,
            fontSize: "0.72rem",
            fontWeight: 600,
            color: status === "added" ? colors.success : colors.danger,
          }}
        >
          {status}
        </span>
      )}
    </li>
  );

  if (!isPhased) {
    return <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>{rows.map(renderRow)}</ul>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {phases.map((phaseId) => (
        <div key={phaseId ?? "unassigned"}>
          <div
            style={{ fontSize: "0.78rem", fontWeight: 600, color: colors.primary, marginBottom: 2 }}
          >
            {phaseId ?? "Unassigned"}
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {rows.filter((r) => r.member.phase_id === phaseId).map(renderRow)}
          </ul>
        </div>
      ))}
    </div>
  );
}
