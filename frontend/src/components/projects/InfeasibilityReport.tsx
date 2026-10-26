import { colors } from "@/components/common/ui";
import { formatFte } from "@/components/projects/staffing";
import type { InfeasibilityDetail, Person, PhaseConflict, Project } from "@/types";

// Mirrors the optimizer's ALLOCATION_STEP: the smallest share a selected person carries.
const ALLOCATION_STEP = 0.2;
const MAX_LISTED_NAMES = 3;

function listNames(names: string[]): string {
  if (names.length <= MAX_LISTED_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_LISTED_NAMES).join(", ")} and ${names.length - MAX_LISTED_NAMES} more`;
}

function explain(
  conflict: PhaseConflict,
  project: Project,
  nameOf: (id: string) => string,
): { reason: string; hint: string } {
  const scope = conflict.phase_id === null ? "the project" : `phase '${conflict.phase_id}'`;
  const need = formatFte(conflict.need_fte);
  // The solver caps the need at what the eligible pool can supply.
  const fit =
    conflict.need_fte < conflict.required_fte
      ? `the ${need} FTE ${scope} can staff from who is available (of ${formatFte(conflict.required_fte)} required)`
      : `the ${need} FTE ${scope} needs`;
  const squads = conflict.squad_indices.map((i) => {
    const memberIds = project.squads[i].member_ids;
    return `${listNames(memberIds.map(nameOf))} (${memberIds.length} people)`;
  });
  const squadPhrase = `${squads.length === 1 ? "Squad of" : "Squads of"} ${squads.join(" and of ")}`;
  const forced = listNames(conflict.forced_person_ids.map(nameOf));
  const oneForced = conflict.forced_person_ids.length === 1;
  const forcedNoun = oneForced ? "member" : "members";

  switch (conflict.reason) {
    case "squad_conflict":
      return {
        reason: `${squadPhrase} must be staffed together at ${ALLOCATION_STEP} FTE or more each, which doesn't fit ${fit}.`,
        hint: `Drop or shrink the ${squads.length === 1 ? "squad" : "squads"}, or raise the required FTE or max people.`,
      };
    case "forced_member_conflict":
      return {
        reason: `Forced ${forcedNoun} ${forced} can't ${oneForced ? "be" : "all be"} staffed within ${fit}.`,
        hint: `Un-force ${oneForced ? "this member" : "one of them"}, or raise the required FTE or max people.`,
      };
    case "squad_and_forced_member_conflict":
      return {
        reason: `${squadPhrase} and forced ${forcedNoun} ${forced} can't all be staffed within ${fit}.`,
        hint: "Drop or shrink a squad, or un-force a member.",
      };
    case "fte_not_reachable":
      return {
        reason: `No mix of available people adds up to ${fit} in whole days per week.`,
        hint: "Add candidates, or reduce the required FTE.",
      };
  }
}

/** Explains, in terms of the project's own setup, why the optimizer found no feasible team. */
export function InfeasibilityReport({
  detail,
  project,
  people,
}: {
  detail: InfeasibilityDetail;
  project: Project;
  people: Person[];
}) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  return (
    <div
      role="alert"
      style={{
        marginTop: "0.75rem",
        padding: "0.75rem",
        borderRadius: 6,
        background: colors.dangerBg,
        color: colors.text,
        fontSize: "0.85rem",
      }}
    >
      <strong style={{ color: colors.danger }}>No feasible team for these constraints</strong>
      {detail.conflicts.length === 0 ? (
        <p style={{ margin: "0.4rem 0 0" }}>{detail.message}</p>
      ) : (
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
          {detail.conflicts.map((conflict, i) => {
            const { reason, hint } = explain(conflict, project, nameOf);
            return (
              <li key={i} style={{ marginBottom: "0.4rem" }}>
                {reason}
                <div style={{ color: colors.muted, fontSize: "0.8rem" }}>{hint}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
