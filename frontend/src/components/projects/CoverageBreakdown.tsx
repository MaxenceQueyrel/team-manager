import { Badge, colors } from "@/components/common/ui";
import { fillColors, formatFte } from "@/components/projects/staffing";
import type { PhaseCoverage, SkillCoverage } from "@/types";

function Bar({ ratio, met }: { ratio: number; met: boolean }) {
  const percent = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div
      aria-hidden
      style={{
        height: 6,
        borderRadius: 3,
        background: colors.border,
        overflow: "hidden",
        minWidth: 60,
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: "100%",
          background: met ? fillColors.complete : fillColors.partial,
        }}
      />
    </div>
  );
}

const hintStyle = { margin: "0.2rem 0 0", fontSize: "0.78rem", color: colors.muted } as const;
const cellStyle = { padding: "0.2rem 0.5rem 0.2rem 0", verticalAlign: "top" } as const;
const barCellStyle = { ...cellStyle, width: "30%", verticalAlign: "middle" } as const;

function SkillRow({ skill }: { skill: SkillCoverage }) {
  return (
    <tr>
      <th scope="row" style={{ ...cellStyle, fontWeight: 400, textAlign: "left" }}>
        {skill.skill_id}
      </th>
      <td style={barCellStyle}>
        <Bar ratio={skill.best_level / (skill.required_level || 1)} met={skill.met} />
      </td>
      <td style={cellStyle}>
        Level {formatFte(skill.best_level)} / {formatFte(skill.required_level)}
        {skill.met ? (
          <span style={{ color: colors.success }}>
            {" "}
            · covered ({formatFte(skill.covered_fte)} FTE)
          </span>
        ) : (
          <>
            <span style={{ color: colors.danger }}> · not covered</span>
            <p style={hintStyle}>
              Add a candidate with {skill.skill_id} ≥ {formatFte(skill.required_level)}, or lower
              the required level.
            </p>
          </>
        )}
      </td>
    </tr>
  );
}

function PhaseTable({ phase }: { phase: PhaseCoverage }) {
  const label = phase.phase_id === null ? "Whole project" : `Phase ${phase.phase_id}`;
  return (
    <table
      aria-label={`Coverage of ${label}`}
      style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.6rem" }}
    >
      <caption style={{ textAlign: "left", fontWeight: 600, marginBottom: "0.2rem" }}>
        {label}
      </caption>
      <tbody>
        <tr>
          <th scope="row" style={{ ...cellStyle, fontWeight: 400, textAlign: "left" }}>
            FTE
          </th>
          <td style={barCellStyle}>
            <Bar ratio={phase.staffed_fte / phase.required_fte} met={phase.fte_met} />
          </td>
          <td style={cellStyle}>
            <span style={{ color: phase.fte_met ? colors.success : colors.danger }}>
              {formatFte(phase.staffed_fte)} / {formatFte(phase.required_fte)} FTE staffed
            </span>
            {!phase.fte_met && (
              <p style={hintStyle}>
                Only {formatFte(phase.available_fte)} FTE is available from eligible people — add
                candidates or reduce the required FTE.
              </p>
            )}
          </td>
        </tr>
        {phase.skills.map((skill) => (
          <SkillRow key={skill.skill_id} skill={skill} />
        ))}
      </tbody>
    </table>
  );
}

/** Per-phase FTE and per-skill coverage of a proposal, expanded when something is unmet. */
export function CoverageBreakdown({
  coverage,
  fullyCovered,
}: {
  coverage: PhaseCoverage[];
  fullyCovered: boolean | null;
}) {
  // Teams saved before coverage was tracked carry none; there is nothing to show for them.
  if (coverage.length === 0) return null;

  const gaps = coverage.reduce(
    (count, phase) => count + Number(!phase.fte_met) + phase.skills.filter((s) => !s.met).length,
    0,
  );
  return (
    <details open={!fullyCovered} style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
      <summary style={{ cursor: "pointer" }}>
        {fullyCovered ? (
          <Badge color={colors.success}>All requirements covered</Badge>
        ) : (
          <Badge color={colors.danger}>
            {gaps} unmet {gaps === 1 ? "requirement" : "requirements"}
          </Badge>
        )}{" "}
        <span style={{ color: colors.muted }}>Requirement coverage</span>
      </summary>
      {coverage.map((phase) => (
        <PhaseTable key={phase.phase_id ?? "whole-project"} phase={phase} />
      ))}
    </details>
  );
}
