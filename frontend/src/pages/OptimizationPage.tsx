import { useEffect, useState } from "react";
import { TeamMembers } from "@/components/common/TeamMembers";
import { Button, Card, colors, Field, selectStyle } from "@/components/common/ui";
import { optimizationApi, teamsApi } from "@/services/api";
import { useAppStore } from "@/store";
import type { OptimizationResponse, OptimizationWeights, Team, TeamProposal } from "@/types";

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

// Expressed as a share of max_score rather than of the best score: the best score can be
// zero or negative (negative affinities), while max_score is shared by the whole pool.
function deltaVsBest(proposal: TeamProposal, best: Team): string {
  const maxScore = proposal.optimization_max_score;
  const loss =
    maxScore > 0 ? ((best.optimization_score ?? 0) - proposal.optimization_score) / maxScore : 0;
  const percent = (loss * 100).toFixed(1);
  return percent === "0.0" ? "same score as best" : `−${percent}% vs best`;
}

export default function OptimizationPage() {
  const {
    projects,
    people,
    optimizationWeights,
    setWeights,
    fetchProjects,
    fetchPeople,
    fetchTeams,
  } = useAppStore();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [respectExclusions, setRespectExclusions] = useState(true);
  const [nAlternatives, setNAlternatives] = useState(2);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);
  const [promotedIndices, setPromotedIndices] = useState<Set<number>>(new Set());
  const [promoteError, setPromoteError] = useState<string | null>(null);

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
      const response = await optimizationApi.solve({
        project_id: selectedProjectId,
        weights: optimizationWeights,
        respect_exclusions: respectExclusions,
        n_alternatives: nAlternatives,
      });
      setResult(response);
      setShowAlternatives(false);
      setPromotedIndices(new Set());
      setPromoteError(null);
      fetchTeams();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePromote = async (best: Team, proposal: TeamProposal, index: number) => {
    setPromotingIndex(index);
    setPromoteError(null);
    try {
      await teamsApi.create({ project_id: best.project_id, ...proposal });
      setPromotedIndices((prev) => new Set(prev).add(index));
      fetchTeams();
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromotingIndex(null);
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
                <strong>{label}</strong>{" "}
                <span style={{ color: colors.muted }}>— {description}</span>
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
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {selectedProject && (
          <p style={{ fontSize: "0.82rem", color: colors.muted, marginTop: "-0.4rem" }}>
            {selectedProject.phases.length
              ? `${selectedProject.phases.length} phase(s)`
              : `${selectedProject.n_slots} slot(s)`}
            {selectedProject.squads.length > 0 && ` · ${selectedProject.squads.length} squad(s)`}
            {selectedProject.included_person_ids.length > 0 &&
              ` · ${selectedProject.included_person_ids.length} forced member(s)`}
          </p>
        )}

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

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Button variant="primary" onClick={handleSolve} disabled={!selectedProjectId || loading}>
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
        {error && <p style={{ color: colors.danger, marginTop: "0.75rem" }}>{error}</p>}
      </Card>

      {result && (
        <Card>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Result</h2>
          <p style={{ marginTop: 0 }}>
            Optimization score:{" "}
            <strong>
              {result.best.optimization_score != null && result.best.optimization_max_score != null
                ? `${result.best.optimization_score.toFixed(2)}/${result.best.optimization_max_score.toFixed(2)}`
                : "—"}
            </strong>
          </p>
          {result.best.members.length === 0 ? (
            <p style={{ color: colors.muted }}>
              No feasible assignment found for these constraints.
            </p>
          ) : (
            <TeamMembers members={result.best.members} people={people} />
          )}
        </Card>
      )}

      {result && result.alternatives.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <Button variant="ghost" onClick={() => setShowAlternatives(!showAlternatives)}>
            {showAlternatives
              ? "Hide alternatives ▾"
              : `Show ${result.alternatives.length} alternative ${result.alternatives.length === 1 ? "team" : "teams"} ▸`}
          </Button>
          {promoteError && <p style={{ color: colors.danger }}>{promoteError}</p>}
          {showAlternatives && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "0.75rem",
              }}
            >
              {result.alternatives.map((proposal, i) => (
                <Card key={i}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <h3 style={{ fontSize: "0.95rem", margin: 0 }}>Alternative {i + 1}</h3>
                    <Button
                      onClick={() => handlePromote(result.best, proposal, i)}
                      disabled={promotingIndex !== null || promotedIndices.has(i)}
                    >
                      {promotedIndices.has(i) ? "Added to teams" : "Use this team"}
                    </Button>
                  </div>
                  <p style={{ margin: "0.4rem 0 0.75rem", fontSize: "0.875rem" }}>
                    Optimization score:{" "}
                    <strong>
                      {proposal.optimization_score.toFixed(2)}/
                      {proposal.optimization_max_score.toFixed(2)}
                    </strong>{" "}
                    <span style={{ color: colors.muted }}>
                      · {deltaVsBest(proposal, result.best)}
                    </span>
                  </p>
                  <TeamMembers
                    members={proposal.members}
                    people={people}
                    baseline={result.best.members}
                  />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
