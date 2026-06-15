import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { optimizationApi } from "@/services/api";
import type { Team } from "@/types";

const WEIGHT_KEYS = [
  { key: "performance_weight", label: "Performance", description: "Maximize skill match & seniority" },
  { key: "chemistry_weight", label: "Chemistry", description: "Maximize mutual affinity scores" },
  { key: "growth_weight", label: "Growth", description: "Maximize learning opportunities" },
  { key: "cost_weight", label: "Cost Efficiency", description: "Avoid over-qualification" },
] as const;

export default function OptimizationPage() {
  const { projects, people, optimizationWeights, setWeights, fetchProjects, fetchPeople } =
    useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [result, setResult] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
    fetchPeople();
  }, [fetchProjects, fetchPeople]);

  const handleSolve = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const team = await optimizationApi.solve({
        project_id: selectedProjectId,
        weights: optimizationWeights,
        respect_exclusions: true,
      });
      setResult(team);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const personById = Object.fromEntries(people.map((p) => [p.id, p]));

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Optimization</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Objective Weights</h2>
        <p style={{ color: "#6c757d", fontSize: "0.875rem" }}>
          Adjust the sliders to define what "best team" means for this project.
        </p>
        {WEIGHT_KEYS.map(({ key, label, description }) => (
          <div key={key} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <label>
                <strong>{label}</strong> — {description}
              </label>
              <span>{(optimizationWeights[key] * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={optimizationWeights[key]}
              onChange={(e) => setWeights({ [key]: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Select Project</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ flex: 1, padding: "0.5rem" }}
          >
            <option value="">— choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSolve}
            disabled={!selectedProjectId || loading}
            style={{ padding: "0.5rem 1rem" }}
          >
            {loading ? "Solving…" : "Find Optimal Team"}
          </button>
        </div>
        {error && <p style={{ color: "#dc3545", marginTop: "0.5rem" }}>{error}</p>}
      </section>

      {result && (
        <section>
          <h2 style={{ fontSize: "1.1rem" }}>Result</h2>
          <p>
            Optimization score:{" "}
            <strong>{result.optimization_score?.toFixed(4) ?? "—"}</strong>
          </p>
          <ul>
            {result.members.map((m) => (
              <li key={m.person_id}>
                {personById[m.person_id]?.name ?? m.person_id} (
                {personById[m.person_id]?.role}) — {(m.fte_allocation * 100).toFixed(0)}% FTE
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
