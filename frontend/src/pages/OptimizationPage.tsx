import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { optimizationApi } from "@/services/api";
import type { OptimizationWeights, Team } from "@/types";
import { Button, Card, colors, Field, inputStyle } from "@/components/common/ui";
import { TeamMembers } from "@/components/common/TeamMembers";

const WEIGHT_KEYS: { key: keyof OptimizationWeights; label: string; description: string }[] = [
  { key: "performance", label: "Performance", description: "Skill fit & seniority" },
  { key: "chemistry", label: "Chemistry", description: "Pairwise affinity between members" },
  { key: "growth", label: "Growth", description: "Learning opportunities" },
  { key: "cost", label: "Cost Efficiency", description: "Avoid over-qualification" },
  { key: "handover", label: "Handover", description: "Keep the same people across consecutive phases" },
];

export default function OptimizationPage() {
  const { projects, people, optimizationWeights, setWeights, fetchProjects, fetchPeople, fetchTeams } =
    useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [respectExclusions, setRespectExclusions] = useState(true);
  const [result, setResult] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
    fetchPeople();
  }, [fetchProjects, fetchPeople]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleSolve = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const team = await optimizationApi.solve({
        project_id: selectedProjectId,
        weights: optimizationWeights,
        respect_exclusions: respectExclusions,
      });
      setResult(team);
      fetchTeams();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <h1>Optimization</h1>

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Objective weights</h2>
        <p style={{ color: colors.muted, fontSize: "0.875rem", marginTop: 0 }}>
          Adjust the sliders to define what "best team" means for this project.
        </p>
        {WEIGHT_KEYS.map(({ key, label, description }) => (
          <div key={key} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>
                <strong>{label}</strong> <span style={{ color: colors.muted }}>— {description}</span>
              </span>
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
      </Card>

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Run</h2>
        <Field label="Project">
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={inputStyle}>
            <option value="">— choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        {selectedProject && (
          <p style={{ fontSize: "0.82rem", color: colors.muted, marginTop: "-0.4rem" }}>
            {selectedProject.phases.length
              ? `${selectedProject.phases.length} phase(s)`
              : `${selectedProject.n_slots} slot(s)`}
            {selectedProject.squads.length > 0 && ` · ${selectedProject.squads.length} squad(s)`}
            {selectedProject.included_person_ids.length > 0 && ` · ${selectedProject.included_person_ids.length} forced member(s)`}
          </p>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", margin: "0.5rem 0 1rem" }}>
          <input type="checkbox" checked={respectExclusions} onChange={(e) => setRespectExclusions(e.target.checked)} />
          Respect excluded people
        </label>

        <Button variant="primary" onClick={handleSolve} disabled={!selectedProjectId || loading}>
          {loading ? "Solving…" : "Find optimal team"}
        </Button>
        {error && <p style={{ color: colors.danger, marginTop: "0.75rem" }}>{error}</p>}
      </Card>

      {result && (
        <Card>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Result</h2>
          <p style={{ marginTop: 0 }}>
            Optimization score: <strong>{result.optimization_score?.toFixed(4) ?? "—"}</strong>
          </p>
          {result.members.length === 0 ? (
            <p style={{ color: colors.muted }}>No feasible assignment found for these constraints.</p>
          ) : (
            <TeamMembers members={result.members} people={people} />
          )}
        </Card>
      )}
    </div>
  );
}
