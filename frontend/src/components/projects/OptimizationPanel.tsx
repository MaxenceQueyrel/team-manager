import { useState } from "react";
import { Button, colors, selectStyle } from "@/components/common/ui";
import { errorMessage, optimizationApi } from "@/services/api";
import { useAppStore } from "@/store";
import type { OptimizationResponse, OptimizationWeights, Project } from "@/types";

const WEIGHT_KEYS: { key: keyof OptimizationWeights; label: string; description: string }[] = [
  { key: "performance", label: "Performance", description: "Skill fit & seniority" },
  { key: "chemistry", label: "Chemistry", description: "Pairwise affinity between members" },
  { key: "growth", label: "Growth", description: "Learning opportunities" },
  { key: "cost", label: "Cost Efficiency", description: "Avoid over-qualification" },
  {
    key: "handover",
    label: "Handover",
    description: "Keep the same people across consecutive phases",
  },
];

const MAX_ALTERNATIVES = 5;

export const OPTIMIZATION_PANEL_WIDTH = 360;

/** Right-side panel holding the solver settings for one project; results are handed to the caller. */
export function OptimizationPanel({
  project,
  onResult,
  onClose,
}: {
  project: Project;
  onResult: (result: OptimizationResponse) => void;
  onClose: () => void;
}) {
  const { optimizationWeights, setWeights } = useAppStore();
  const [respectExclusions, setRespectExclusions] = useState(true);
  const [nAlternatives, setNAlternatives] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const solve = async () => {
    setLoading(true);
    setError(null);
    try {
      onResult(
        await optimizationApi.solve({
          project_id: project.id,
          weights: optimizationWeights,
          respect_exclusions: respectExclusions,
          n_alternatives: nAlternatives,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="Optimize staffing"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: OPTIMIZATION_PANEL_WIDTH,
        padding: "1.25rem",
        background: "#fff",
        borderLeft: `1px solid ${colors.border}`,
        boxShadow: "-6px 0 24px rgba(0,0,0,0.08)",
        overflow: "auto",
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Optimize staffing</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            border: "none",
            background: "none",
            fontSize: "1.4rem",
            cursor: "pointer",
            lineHeight: 1,
            color: colors.muted,
          }}
        >
          ×
        </button>
      </div>
      <p style={{ fontSize: "0.82rem", color: colors.muted, margin: "0.4rem 0 1rem" }}>
        {project.phases.length ? `${project.phases.length} phase(s)` : `${project.n_slots} slot(s)`}
        {project.squads.length > 0 && ` · ${project.squads.length} squad(s)`}
        {project.included_person_ids.length > 0 &&
          ` · ${project.included_person_ids.length} forced member(s)`}
      </p>

      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}>Objective weights</h3>
      <p style={{ color: colors.muted, fontSize: "0.8rem", marginTop: 0 }}>
        Define what "best team" means for this project.
      </p>
      {WEIGHT_KEYS.map(({ key, label, description }) => (
        <div key={key} style={{ marginBottom: "0.85rem", fontSize: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <strong>{label}</strong>
            <span>{(optimizationWeights[key] * 100).toFixed(0)}%</span>
          </div>
          <div style={{ color: colors.muted, fontSize: "0.78rem" }}>{description}</div>
          <input
            type="range"
            aria-label={label}
            min={0}
            max={1}
            step={0.05}
            value={optimizationWeights[key]}
            onChange={(e) => setWeights({ [key]: parseFloat(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>
      ))}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "0.875rem",
          margin: "0.5rem 0 1rem",
        }}
      >
        <input
          type="checkbox"
          checked={respectExclusions}
          onChange={(e) => setRespectExclusions(e.target.checked)}
        />
        Respect excluded people
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={solve} disabled={loading}>
          {loading ? "Solving…" : "Find optimal team"}
        </Button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem" }}>
          Alternatives
          <select
            value={nAlternatives}
            onChange={(e) => setNAlternatives(Number(e.target.value))}
            style={{ ...selectStyle, width: "auto" }}
          >
            {Array.from({ length: MAX_ALTERNATIVES + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" style={{ color: colors.danger, marginTop: "0.75rem" }}>
          {error}
        </p>
      )}
    </aside>
  );
}
