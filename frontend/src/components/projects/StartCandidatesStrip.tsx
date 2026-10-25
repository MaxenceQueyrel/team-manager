import type { CSSProperties } from "react";
import { formatDay } from "@/components/common/dates";
import { colors } from "@/components/common/ui";
import type { StartCandidate } from "@/types";

function outcome(candidate: StartCandidate): string {
  if (!candidate.feasible) return "infeasible";
  return candidate.fully_covered ? "covered" : "partial";
}

/** Row of the weekly starts the optimizer tried, with each start's score and coverage.
 * The optimizer's `chosen` start is marked "chosen"; every feasible start is a toggle
 * button that calls `onSelect` to show its team, and the `selected` one is pressed.
 * Infeasible starts are greyed out and not interactive. */
export function StartCandidatesStrip({
  candidates,
  chosen,
  selected,
  today,
  onSelect,
}: {
  candidates: StartCandidate[];
  chosen: string | null;
  selected: string | null;
  today: string;
  onSelect: (start: string) => void;
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
          const isSelected = candidate.start === selected;
          const cellStyle: CSSProperties = {
            display: "block",
            minWidth: "5.5rem",
            padding: "0.35rem 0.5rem",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${isChosen ? colors.primary : colors.border}`,
            boxShadow: isSelected ? `0 0 0 2px ${colors.primary}` : undefined,
            background: isSelected
              ? colors.primaryBg
              : candidate.feasible
                ? colors.surface
                : colors.neutralBg,
            color: candidate.feasible ? colors.text : colors.subtle,
            fontFamily: "inherit",
            fontSize: "0.78rem",
            textAlign: "left",
          };
          const content = (
            <>
              <span style={{ display: "block", fontWeight: 600 }}>
                {formatDay(candidate.start, !candidate.start.startsWith(today.slice(0, 4)))}
              </span>
              <span className="mono" style={{ display: "block" }}>
                {candidate.score != null ? candidate.score.toFixed(2) : "—"}
              </span>
              <span
                style={{
                  display: "block",
                  color: candidate.fully_covered
                    ? colors.success
                    : candidate.feasible
                      ? colors.warningText
                      : colors.subtle,
                }}
              >
                {outcome(candidate)}
                {isChosen && " · chosen"}
              </span>
            </>
          );
          return (
            <li key={candidate.start} aria-current={isChosen ? "true" : undefined}>
              {candidate.team ? (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(candidate.start)}
                  style={{ ...cellStyle, cursor: "pointer" }}
                >
                  {content}
                </button>
              ) : (
                <div style={cellStyle}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
