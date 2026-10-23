import { Columns2 } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";
import { Button, Card, colors, Modal } from "@/components/common/ui";
import { formatDay, formatFte, staffingBaseline } from "@/components/projects/staffing";
import type { AssignedMember, Assignment, Person, Team } from "@/types";

const memberKey = (m: AssignedMember) => `${m.person_id}|${m.phase_id}`;

function coveredFte(members: AssignedMember[]): number {
  return members.reduce((sum, m) => sum + m.fte_allocation, 0);
}

function savedOn(createdAt: string | null, today: string): string {
  if (!createdAt) return "Date not recorded";
  const saved = new Date(createdAt);
  // Shift by the UTC offset so the ISO slice is the viewer's local calendar day.
  const local = new Date(saved.getTime() - saved.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  return `Saved ${formatDay(local, !local.startsWith(today.slice(0, 4)))}`;
}

/** Sidebar list of the project's saved optimizer proposals, newest first, with a Review
 * toggle per proposal and a side-by-side comparison against current staffing. */
export function ProposalsCard({
  proposals,
  people,
  assignments,
  totalFte,
  today,
  reviewingId,
  onReview,
}: {
  proposals: Team[];
  people: Person[];
  assignments: Assignment[];
  totalFte: number;
  today: string;
  reviewingId: string | null;
  onReview: (teamId: string | null) => void;
}) {
  const headingId = useId();
  const [comparing, setComparing] = useState(false);
  const numberOf = (index: number) => proposals.length - index;

  return (
    <section aria-labelledby={headingId}>
      <Card style={{ padding: 0 }}>
        <div style={{ padding: "1.25rem 1.5rem 1rem" }}>
          <h2 id={headingId} style={{ margin: 0 }}>
            Proposals
          </h2>
          <div style={{ marginTop: "0.2rem", fontSize: "0.88rem", color: colors.muted }}>
            Saved results from the staffing optimizer
          </div>
        </div>
        {proposals.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "1rem 1.5rem 1.25rem",
              borderTop: `1px solid ${colors.border}`,
              fontSize: "0.88rem",
              color: colors.muted,
            }}
          >
            No saved proposals yet. Run the optimizer to get one.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {proposals.map((team, i) => {
              const reviewing = team.id === reviewingId;
              return (
                <li
                  key={team.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1.5rem",
                    borderTop: `1px solid ${colors.border}`,
                    background: reviewing ? colors.light : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    className="mono"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: "var(--radius-sm)",
                      background: colors.primaryBg,
                      color: colors.primary,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {numberOf(i)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>Proposal {numberOf(i)}</div>
                    <div style={{ fontSize: "0.8rem", color: colors.muted }}>
                      {savedOn(team.created_at, today)} ·{" "}
                      <span className="mono">
                        {formatFte(coveredFte(team.members))} of {totalFte} FTE
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    ariaLabel={`${reviewing ? "Hide" : "Review"} proposal ${numberOf(i)}`}
                    onClick={() => onReview(reviewing ? null : team.id)}
                  >
                    {reviewing ? "Hide" : "Review"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {proposals.length > 1 && (
          <div
            style={{ padding: "0.85rem 1.5rem 1.25rem", borderTop: `1px solid ${colors.border}` }}
          >
            <Button icon={Columns2} onClick={() => setComparing(true)} style={{ width: "100%" }}>
              Compare side by side
            </Button>
          </div>
        )}
      </Card>

      {comparing && (
        <CompareProposalsModal
          proposals={proposals}
          people={people}
          assignments={assignments}
          totalFte={totalFte}
          onClose={() => setComparing(false)}
        />
      )}
    </section>
  );
}

function CompareProposalsModal({
  proposals,
  people,
  assignments,
  totalFte,
  onClose,
}: {
  proposals: Team[];
  people: Person[];
  assignments: Assignment[];
  totalFte: number;
  onClose: () => void;
}) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const phased = proposals.some((team) => team.members.some((m) => m.phase_id !== null));
  const memberLabel = (m: AssignedMember) =>
    phased ? `${m.phase_id ?? "unphased"}: ${nameOf(m.person_id)}` : nameOf(m.person_id);
  const current = staffingBaseline(
    assignments,
    proposals.flatMap((team) => team.members),
  );
  const columns = [
    { key: "current", title: "Current staffing", team: null, members: current },
    ...proposals.map((team, i) => ({
      key: team.id,
      title: `Proposal ${proposals.length - i}`,
      team,
      members: team.members,
    })),
  ];

  const cell: CSSProperties = {
    padding: "0.75rem 0.9rem",
    borderTop: `1px solid ${colors.border}`,
    verticalAlign: "top",
    textAlign: "left",
    minWidth: "11rem",
  };
  const rowHeader: CSSProperties = {
    ...cell,
    minWidth: 0,
    color: colors.muted,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
  const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

  return (
    <Modal title="Compare proposals" onClose={onClose} maxWidth={1040}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.88rem" }}>
          <thead>
            <tr>
              <td />
              {columns.map((column) => (
                <th key={column.key} scope="col" style={{ ...cell, borderTop: "none" }}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={rowHeader}>
                Members
              </th>
              {columns.map((column) => (
                <td key={column.key} style={cell}>
                  {column.members.length === 0 ? (
                    <span style={{ color: colors.muted }}>Nobody</span>
                  ) : (
                    <ul style={list}>
                      {column.members.map((m) => (
                        <li key={memberKey(m)}>
                          {memberLabel(m)}{" "}
                          <span className="mono" style={{ color: colors.muted }}>
                            {formatFte(m.fte_allocation)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" style={rowHeader}>
                FTE covered
              </th>
              {columns.map((column) => (
                <td key={column.key} className="mono" style={cell}>
                  {formatFte(coveredFte(column.members))} of {totalFte}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" style={rowHeader}>
                Score
              </th>
              {columns.map(({ key, team }) => (
                <td key={key} className="mono" style={cell}>
                  {team?.optimization_score != null && team.optimization_max_score != null
                    ? `${team.optimization_score.toFixed(2)} / ${team.optimization_max_score.toFixed(2)}`
                    : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" style={rowHeader}>
                Change vs current
              </th>
              {columns.map(({ key, team }) => {
                if (!team) {
                  return (
                    <td key={key} style={{ ...cell, color: colors.muted }}>
                      —
                    </td>
                  );
                }
                const baseline = staffingBaseline(assignments, team.members);
                const baselineKeys = new Set(baseline.map(memberKey));
                const teamKeys = new Set(team.members.map(memberKey));
                const added = team.members.filter((m) => !baselineKeys.has(memberKey(m)));
                const dropped = baseline.filter((m) => !teamKeys.has(memberKey(m)));
                return (
                  <td key={key} style={cell}>
                    {added.length === 0 && dropped.length === 0 ? (
                      <span style={{ color: colors.muted }}>Same as current</span>
                    ) : (
                      <ul style={list}>
                        {added.map((m) => (
                          <li key={`added-${memberKey(m)}`} style={{ color: colors.success }}>
                            + {memberLabel(m)}
                          </li>
                        ))}
                        {dropped.map((m) => (
                          <li key={`dropped-${memberKey(m)}`} style={{ color: colors.danger }}>
                            − {memberLabel(m)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
