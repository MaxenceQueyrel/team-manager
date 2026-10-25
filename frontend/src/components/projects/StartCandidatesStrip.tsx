import { formatDay } from "@/components/common/dates";
import { colors } from "@/components/common/ui";
import type { StartCandidate } from "@/types";

function outcome(candidate: StartCandidate): string {
  if (!candidate.feasible) return "infeasible";
  return candidate.fully_covered ? "covered" : "partial";
}

/** Read-only row of the weekly starts the optimizer tried, with each start's score and
 * coverage; infeasible starts are greyed out and the `chosen` one is highlighted. */
export function StartCandidatesStrip({
  candidates,
  chosen,
  today,
}: {
  candidates: StartCandidate[];
  chosen: string | null;
  today: string;
}) {
  return (
    <section aria-label="Start dates tried" style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 5 }}>Start dates tried</div>
      <ol
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.4rem",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {candidates.map((candidate) => {
          const isChosen = candidate.start === chosen;
          return (
            <li
              key={candidate.start}
              aria-current={isChosen ? "true" : undefined}
              style={{
                minWidth: "5.5rem",
                padding: "0.35rem 0.5rem",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${isChosen ? colors.primary : colors.border}`,
                background: isChosen
                  ? colors.primaryBg
                  : candidate.feasible
                    ? colors.surface
                    : colors.neutralBg,
                color: candidate.feasible ? colors.text : colors.subtle,
                fontSize: "0.78rem",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {formatDay(candidate.start, !candidate.start.startsWith(today.slice(0, 4)))}
              </div>
              <div className="mono">
                {candidate.score != null ? candidate.score.toFixed(2) : "—"}
              </div>
              <div
                style={{
                  color: candidate.fully_covered
                    ? colors.success
                    : candidate.feasible
                      ? colors.warningText
                      : colors.subtle,
                }}
              >
                {outcome(candidate)}
                {isChosen && " · chosen"}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
