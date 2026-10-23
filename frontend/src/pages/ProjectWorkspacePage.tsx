import { isAxiosError } from "axios";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import {
  Button,
  Card,
  colors,
  IconButton,
  Menu,
  type MenuItem,
  PageHeader,
  Pill,
  priorityIcons,
  priorityTones,
} from "@/components/common/ui";
import {
  OPTIMIZATION_PANEL_WIDTH,
  OptimizationPanel,
} from "@/components/projects/OptimizationPanel";
import { PhaseTimeline } from "@/components/projects/PhaseTimeline";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ProposalCard } from "@/components/projects/ProposalCard";
import { ProposalsCard } from "@/components/projects/ProposalsCard";
import { StaffingLaneCard } from "@/components/projects/StaffingLaneCard";
import {
  buildLanes,
  formatDay,
  formatFte,
  isoToday,
  projectSpan,
  projectStatus,
  projectStatusLabels,
  projectStatusTones,
  staffedFte,
  staffingBaseline,
} from "@/components/projects/staffing";
import { assignmentsApi, errorMessage, projectsApi, teamsApi } from "@/services/api";
import { knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, OptimizationResponse, Project, Team, TeamProposal } from "@/types";

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
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [savingCompletion, setSavingCompletion] = useState(false);

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
    setReviewingId(null);
    projectsApi
      .get(id)
      .then(setProject)
      .catch((e) => {
        if (isAxiosError(e) && e.response?.status === 404) setNotFound(true);
        else setError(errorMessage(e));
      });
    assignmentsApi
      .list({ project_id: id })
      .then(setAssignments)
      .catch((e) => setError(errorMessage(e)));
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

  const today = isoToday();
  const lanes = buildLanes(project, assignments);
  const { staffed, total } = staffedFte(lanes);
  const status = projectStatus(project, lanes, today);
  const span = projectSpan(project);
  const endedButOpen = !project.completed_at && span !== null && span.end < today;
  const phased = project.phases.length > 0;
  // The store keeps teams in creation order.
  const proposals = teams.filter((t) => t.project_id === project.id).reverse();
  const reviewIndex = proposals.findIndex((t) => t.id === reviewingId);
  const reviewed = reviewIndex === -1 ? null : proposals[reviewIndex];

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

  // PUT replaces the whole project, so completion is saved with the full payload.
  const setCompletedAt = async (completedAt: string | null) => {
    const { id: projectId, ...draft } = project;
    setSavingCompletion(true);
    setError(null);
    try {
      await saveProject({ ...draft, completed_at: completedAt }, projectId);
      setProject(await projectsApi.get(projectId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingCompletion(false);
    }
  };

  const menuItems: MenuItem[] = [];
  if (canWriteProjects) {
    menuItems.push(
      project.completed_at
        ? { label: "Reopen project", icon: RotateCcw, onSelect: () => setCompletedAt(null) }
        : { label: "Mark complete", icon: CircleCheck, onSelect: () => setCompletedAt(today) },
    );
  }
  if (canDeleteProjects) {
    menuItems.push({
      label: "Delete project",
      icon: Trash2,
      danger: true,
      onSelect: async () => {
        if (!confirm(`Delete ${project.name}?`)) return;
        await deleteProject(project.id);
        navigate("/projects");
      },
    });
  }

  return (
    <div style={{ marginRight: optimizing ? OPTIMIZATION_PANEL_WIDTH : 0 }}>
      <PageHeader
        breadcrumb={[{ label: "Projects", to: "/projects" }, { label: project.name }]}
        title={project.name}
        badges={
          <>
            <Pill tone={priorityTones[project.priority]} icon={priorityIcons[project.priority]}>
              {project.priority[0].toUpperCase() + project.priority.slice(1)} priority
            </Pill>
            <Pill tone={projectStatusTones[status]} dot>
              {projectStatusLabels[status]}
            </Pill>
          </>
        }
        subtitle={project.description || undefined}
        actions={
          <>
            {canWriteProjects && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canRunOptimization && (
              <Button
                variant="primary"
                icon={SlidersHorizontal}
                onClick={() => setOptimizing(true)}
              >
                Optimize staffing
              </Button>
            )}
            {menuItems.length > 0 && (
              <Menu
                items={menuItems}
                ariaLabel={`More actions for ${project.name}`}
                variant="secondary"
              />
            )}
          </>
        }
      />

      {endedButOpen && span && (
        <Banner
          actions={
            canWriteProjects && (
              <>
                <Button onClick={() => setEditing(true)}>Extend dates</Button>
                <Button disabled={savingCompletion} onClick={() => setCompletedAt(today)}>
                  Mark complete
                </Button>
              </>
            )
          }
        >
          <strong>This project ended on {formatDay(span.end, true)}</strong> and is still open
          {staffed < total ? ` with ${formatFte(total - staffed)} FTE never filled` : ""}. Close it,
          or extend the dates to keep staffing it.
        </Banner>
      )}
      {project.completed_at && (
        <Banner
          actions={
            canWriteProjects && (
              <Button
                icon={RotateCcw}
                disabled={savingCompletion}
                onClick={() => setCompletedAt(null)}
              >
                Reopen
              </Button>
            )
          }
        >
          <strong>Marked complete on {formatDay(project.completed_at, true)}.</strong> Reopen it to
          keep staffing it.
        </Banner>
      )}

      {error && <p style={{ color: colors.danger, margin: "0 0 1rem" }}>{error}</p>}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "1.5rem" }}>
        <div
          style={{
            flex: "1 1 34rem",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          {result && (
            <section>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "1rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>Optimization result</h2>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.88rem", color: colors.muted }}>
                    Compared with current staffing:{" "}
                    <span style={{ color: colors.success }}>added</span> and{" "}
                    <span style={{ color: colors.danger }}>dropped</span> people per phase.
                  </p>
                </div>
                <IconButton icon={X} ariaLabel="Dismiss result" onClick={() => setResult(null)} />
              </div>
              <ProposalCard
                title="Best team"
                members={result.best.members}
                score={result.best.optimization_score}
                maxScore={result.best.optimization_max_score}
                coverage={result.best.coverage}
                fullyCovered={result.best.fully_covered}
                people={people}
                baseline={staffingBaseline(assignments, result.best.members)}
                onApply={() => applyTeam(result.best.id)}
              />
              {result.alternatives.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <Button
                    variant="ghost"
                    icon={showAlternatives ? ChevronDown : ChevronRight}
                    onClick={() => setShowAlternatives(!showAlternatives)}
                  >
                    {showAlternatives
                      ? "Hide alternatives"
                      : `Show ${result.alternatives.length} alternative ${result.alternatives.length === 1 ? "team" : "teams"}`}
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
                          coverage={proposal.coverage}
                          fullyCovered={proposal.fully_covered}
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
            </section>
          )}

          {reviewed && (
            <ProposalCard
              title={`Proposal ${proposals.length - reviewIndex}`}
              members={reviewed.members}
              score={reviewed.optimization_score}
              maxScore={reviewed.optimization_max_score}
              coverage={reviewed.coverage}
              fullyCovered={reviewed.fully_covered}
              people={people}
              baseline={staffingBaseline(assignments, reviewed.members)}
              onApply={() => applyTeam(reviewed.id)}
              onDelete={
                canDeleteTeams
                  ? async () => {
                      if (!confirm("Delete this proposal?")) return;
                      await deleteTeam(reviewed.id);
                      setReviewingId(null);
                    }
                  : undefined
              }
              onClose={() => setReviewingId(null)}
            />
          )}

          {lanes.map((lane) => (
            <StaffingLaneCard
              key={lane.key}
              lane={lane}
              title={phased ? lane.label : "Staffing"}
              people={people}
              today={today}
              onAssign={async (data) => {
                const created = await assignmentsApi.create({ ...data, project_id: project.id });
                setAssignments((current) => [...current, created]);
              }}
              onRemove={async (assignmentId) => {
                await assignmentsApi.delete(assignmentId);
                setAssignments((current) => current.filter((a) => a.id !== assignmentId));
              }}
              onSuggest={canRunOptimization ? () => setOptimizing(true) : undefined}
            />
          ))}
        </div>

        <div
          style={{
            flex: "1 1 20rem",
            maxWidth: "26rem",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <SidebarCard title="Timeline">
            <PhaseTimeline lanes={lanes} today={today} />
          </SidebarCard>
          <ProposalsCard
            proposals={proposals}
            people={people}
            assignments={assignments}
            totalFte={total}
            today={today}
            reviewingId={reviewingId}
            onReview={setReviewingId}
          />
        </div>
      </div>

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

function Banner({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <Card
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        marginBottom: "1.5rem",
        padding: "1rem 1.25rem",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: "var(--radius)",
          background: colors.neutralBg,
          color: colors.muted,
        }}
      >
        <CalendarDays size={18} />
      </span>
      <p style={{ flex: "1 1 20rem", margin: 0, lineHeight: 1.5 }}>{children}</p>
      {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>{actions}</div>}
    </Card>
  );
}

function SidebarCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card style={{ padding: "1.25rem 1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem" }}>{title}</h2>
        {children}
      </Card>
    </section>
  );
}
