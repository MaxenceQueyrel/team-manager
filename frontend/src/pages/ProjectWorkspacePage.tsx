import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { Badge, Button, Card, colors, priorityColors } from "@/components/common/ui";
import {
  OPTIMIZATION_PANEL_WIDTH,
  OptimizationPanel,
} from "@/components/projects/OptimizationPanel";
import { PhaseTimeline } from "@/components/projects/PhaseTimeline";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ProposalCard } from "@/components/projects/ProposalCard";
import { StaffingLaneCard } from "@/components/projects/StaffingLaneCard";
import { buildLanes, staffedSlots, staffingBaseline } from "@/components/projects/staffing";
import { assignmentsApi, projectsApi, teamsApi } from "@/services/api";
import { knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, OptimizationResponse, Project, Team, TeamProposal } from "@/types";

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function dateSpan(project: Project): string | null {
  const ranges = [
    ...project.date_ranges,
    ...project.phases.flatMap((phase) => (phase.date_range ? [phase.date_range] : [])),
  ];
  if (ranges.length === 0) return null;
  const start = ranges.map((r) => r.start).sort()[0];
  const ends = ranges.map((r) => r.end).sort();
  return `${start} → ${ends[ends.length - 1]}`;
}

// Expressed as a share of max_score rather than of the best score: the best score can be
// zero or negative (negative affinities), while max_score is shared by the whole pool.
function deltaVsBest(proposal: TeamProposal, best: Team): string {
  const maxScore = proposal.optimization_max_score;
  const loss =
    maxScore > 0 ? ((best.optimization_score ?? 0) - proposal.optimization_score) / maxScore : 0;
  const percent = (loss * 100).toFixed(1);
  return percent === "0.0" ? "same score as best" : `−${percent}% vs best`;
}

export default function ProjectWorkspacePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const {
    people,
    teams,
    fetchPeople,
    fetchSkills,
    fetchProjects,
    fetchTeams,
    saveProject,
    deleteProject,
    deleteTeam,
  } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWriteProjects = useAuthStore((s) => s.permissions.has("projects:write"));
  const canDeleteProjects = useAuthStore((s) => s.permissions.has("projects:delete"));
  const canRunOptimization = useAuthStore((s) => s.permissions.has("optimization:run"));
  const canDeleteTeams = useAuthStore((s) => s.permissions.has("teams:delete"));
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  // Alternatives are only persisted when applied; remembering the saved id keeps a
  // retried apply (e.g. after an FTE conflict) from saving the same proposal twice.
  const [savedAlternativeIds, setSavedAlternativeIds] = useState<Record<number, string>>({});
  const [showProposals, setShowProposals] = useState(false);

  useEffect(() => {
    fetchPeople();
    fetchSkills();
    fetchProjects();
    fetchTeams();
  }, [fetchPeople, fetchSkills, fetchProjects, fetchTeams]);

  useEffect(() => {
    setProject(null);
    setNotFound(false);
    setError(null);
    setResult(null);
    projectsApi
      .get(id)
      .then(setProject)
      .catch((e) => {
        if (isAxiosError(e) && e.response?.status === 404) setNotFound(true);
        else setError(message(e));
      });
    assignmentsApi
      .list({ project_id: id })
      .then(setAssignments)
      .catch((e) => setError(message(e)));
  }, [id]);

  if (notFound) {
    return (
      <div>
        <h1 style={{ margin: "0 0 1rem" }}>Project not found</h1>
        <p style={{ color: colors.muted }}>
          No project with id <code>{id}</code> exists in this organization.
        </p>
        <Link to="/projects">← Back to Projects</Link>
      </div>
    );
  }

  if (!project) {
    return error ? <p style={{ color: colors.danger }}>{error}</p> : <p>Loading…</p>;
  }

  const lanes = buildLanes(project, assignments);
  const { staffed, total } = staffedSlots(lanes);
  const span = dateSpan(project);
  // The store keeps teams in creation order.
  const proposals = teams.filter((t) => t.project_id === project.id).reverse();

  const applyTeam = async (teamId: string) => {
    await teamsApi.apply(teamId);
    setAssignments(await assignmentsApi.list({ project_id: project.id }));
  };

  const applyAlternative = async (proposal: TeamProposal, index: number) => {
    let teamId = savedAlternativeIds[index];
    if (!teamId) {
      teamId = (await teamsApi.create({ project_id: project.id, ...proposal })).id;
      setSavedAlternativeIds((current) => ({ ...current, [index]: teamId }));
      fetchTeams();
    }
    await applyTeam(teamId);
  };

  return (
    <div style={{ marginRight: optimizing ? OPTIMIZATION_PANEL_WIDTH : 0 }}>
      <Link to="/projects" style={{ fontSize: "0.85rem", color: colors.muted }}>
        ← Projects
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
          margin: "0.5rem 0 1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            <Badge color={priorityColors[project.priority]}>{project.priority}</Badge>
          </div>
          {project.description && (
            <p style={{ margin: "0.4rem 0 0", color: colors.muted }}>{project.description}</p>
          )}
          <div style={{ marginTop: "0.4rem", fontSize: "0.85rem", color: colors.muted }}>
            {span ?? "No dates set"} · {staffed} / {total} slots staffed
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {canRunOptimization && (
            <Button variant="primary" onClick={() => setOptimizing(true)}>
              Optimize staffing
            </Button>
          )}
          {canWriteProjects && <Button onClick={() => setEditing(true)}>Edit</Button>}
          {canDeleteProjects && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Delete ${project.name}?`)) return;
                await deleteProject(project.id);
                navigate("/projects");
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {error && <p style={{ color: colors.danger, margin: "0 0 1rem" }}>{error}</p>}

      {result && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.1rem" }}>Optimization result</h2>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: colors.muted }}>
            Compared with current staffing: <span style={{ color: colors.success }}>added</span> and{" "}
            <span style={{ color: colors.danger }}>dropped</span> people per phase.
          </p>
          <ProposalCard
            title="Best team"
            members={result.best.members}
            score={result.best.optimization_score}
            maxScore={result.best.optimization_max_score}
            people={people}
            baseline={staffingBaseline(assignments, result.best.members)}
            onApply={() => applyTeam(result.best.id)}
          />
          {result.alternatives.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <Button variant="ghost" onClick={() => setShowAlternatives(!showAlternatives)}>
                {showAlternatives
                  ? "Hide alternatives ▾"
                  : `Show ${result.alternatives.length} alternative ${result.alternatives.length === 1 ? "team" : "teams"} ▸`}
              </Button>
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
                    <ProposalCard
                      key={i}
                      title={`Alternative ${i + 1}`}
                      members={proposal.members}
                      score={proposal.optimization_score}
                      maxScore={proposal.optimization_max_score}
                      scoreNote={deltaVsBest(proposal, result.best)}
                      people={people}
                      baseline={staffingBaseline(assignments, proposal.members)}
                      onApply={() => applyAlternative(proposal, i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Timeline</h2>
        <PhaseTimeline lanes={lanes} />
      </Card>

      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Staffing</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {lanes.map((lane) => (
          <StaffingLaneCard
            key={lane.key}
            lane={lane}
            people={people}
            onAssign={async (data) => {
              const created = await assignmentsApi.create({ ...data, project_id: project.id });
              setAssignments((current) => [...current, created]);
            }}
            onRemove={async (assignmentId) => {
              await assignmentsApi.delete(assignmentId);
              setAssignments((current) => current.filter((a) => a.id !== assignmentId));
            }}
          />
        ))}
      </div>

      {proposals.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <Button variant="ghost" onClick={() => setShowProposals(!showProposals)}>
            {showProposals ? "Hide proposals ▾" : `Proposals (${proposals.length}) ▸`}
          </Button>
          {showProposals && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "0.75rem",
              }}
            >
              {proposals.map((team, i) => (
                <ProposalCard
                  key={team.id}
                  title={`Proposal ${proposals.length - i}`}
                  members={team.members}
                  score={team.optimization_score}
                  maxScore={team.optimization_max_score}
                  people={people}
                  baseline={staffingBaseline(assignments, team.members)}
                  onApply={() => applyTeam(team.id)}
                  onDelete={
                    canDeleteTeams
                      ? () => confirm("Delete this proposal?") && deleteTeam(team.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {optimizing && (
        <OptimizationPanel
          project={project}
          onResult={(response) => {
            setResult(response);
            setShowAlternatives(false);
            setSavedAlternativeIds({});
            fetchTeams();
          }}
          onClose={() => setOptimizing(false)}
        />
      )}

      {editing && (
        <ProjectForm
          project={project}
          people={people}
          skillOptions={skillOptions}
          onClose={() => setEditing(false)}
          onSave={async (draft) => {
            await saveProject(draft, project.id);
            setProject(await projectsApi.get(project.id));
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
