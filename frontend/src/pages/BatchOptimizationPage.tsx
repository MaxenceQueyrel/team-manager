import { CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  colors,
  Modal,
  PageHeader,
  Pill,
  priorityIcons,
  priorityTones,
  StatTile,
} from "@/components/common/ui";
import { InfeasibilityReport } from "@/components/projects/InfeasibilityReport";
import { WeightSliders } from "@/components/projects/OptimizationPanel";
import { ProposalCard } from "@/components/projects/ProposalCard";
import { formatFte, projectSpan, staffingBaseline } from "@/components/projects/staffing";
import {
  assignmentsApi,
  batchInfeasibilityDetail,
  errorMessage,
  optimizationApi,
  teamsApi,
} from "@/services/api";
import { useAppStore } from "@/store";
import type {
  Assignment,
  BatchInfeasibilityDetail,
  BatchOptimizationResponse,
  Person,
  Project,
} from "@/types";

// The batch solve endpoint accepts 2–10 projects.
const MIN_BATCH_PROJECTS = 2;
const MAX_BATCH_PROJECTS = 10;

function listProjectNames(projects: Project[]): string {
  const names = projects.map((p) => p.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Finds the best teams for several projects in one joint solve, and applies them. */
export default function BatchOptimizationPage() {
  const [searchParams] = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const { people, projects, optimizationWeights, fetchPeople, fetchProjects } = useAppStore();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [respectExclusions, setRespectExclusions] = useState(true);
  const [solving, setSolving] = useState(false);
  const [result, setResult] = useState<BatchOptimizationResponse | null>(null);
  const [infeasible, setInfeasible] = useState<BatchInfeasibilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingApplyAll, setConfirmingApplyAll] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyAllError, setApplyAllError] = useState<string | null>(null);
  const [appliedAll, setAppliedAll] = useState(false);

  useEffect(() => {
    fetchPeople();
    fetchProjects();
    assignmentsApi
      .list()
      .then(setAssignments)
      .catch((e) => setError(errorMessage(e)));
  }, [fetchPeople, fetchProjects]);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const selectedProjects = ids.flatMap((id) => {
    const project = projectById.get(id);
    return project ? [project] : [];
  });
  const validCount = ids.length >= MIN_BATCH_PROJECTS && ids.length <= MAX_BATCH_PROJECTS;

  const reloadAssignments = async () => setAssignments(await assignmentsApi.list());

  const solve = async () => {
    setSolving(true);
    setError(null);
    setInfeasible(null);
    setResult(null);
    setAppliedAll(false);
    try {
      setResult(
        await optimizationApi.solveBatch({
          project_ids: ids,
          weights: optimizationWeights,
          respect_exclusions: respectExclusions,
        }),
      );
    } catch (e) {
      const detail = batchInfeasibilityDetail(e);
      if (detail) setInfeasible(detail);
      else setError(errorMessage(e));
    } finally {
      setSolving(false);
    }
  };

  const applyAll = async (teamIds: string[]) => {
    setApplyingAll(true);
    setApplyAllError(null);
    try {
      await teamsApi.applyBatch(teamIds);
      setConfirmingApplyAll(false);
      setAppliedAll(true);
    } catch (e) {
      // The FTE conflict lists people by id, which are opaque UUIDs to the user.
      let text = errorMessage(e);
      for (const person of people) text = text.split(person.id).join(person.name);
      setApplyAllError(text);
      return;
    } finally {
      setApplyingAll(false);
    }
    reloadAssignments().catch((e) => setError(errorMessage(e)));
  };

  const closeApplyAll = () => {
    setConfirmingApplyAll(false);
    setApplyAllError(null);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Projects", to: "/projects" }, { label: "Optimize selected" }]}
        title="Optimize projects together"
        subtitle={
          selectedProjects.length > 0
            ? `Staffs ${listProjectNames(selectedProjects)} in one solve; higher-priority projects are covered first.`
            : undefined
        }
      />

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>Objective weights</h2>
        <p style={{ color: colors.muted, fontSize: "0.82rem", marginTop: 0 }}>
          Define what "best team" means; the same weights apply to every selected project.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
            columnGap: "1.5rem",
          }}
        >
          <WeightSliders />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.875rem",
            margin: "0.25rem 0 1rem",
          }}
        >
          <input
            type="checkbox"
            checked={respectExclusions}
            onChange={(e) => setRespectExclusions(e.target.checked)}
          />
          Respect excluded people
        </label>
        <Button variant="primary" onClick={solve} disabled={solving || !validCount}>
          {solving ? "Solving…" : "Find optimal teams"}
        </Button>
        {!validCount && (
          <p style={{ color: colors.muted, margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
            Select {MIN_BATCH_PROJECTS} to {MAX_BATCH_PROJECTS} projects on the{" "}
            <Link to="/projects">Projects</Link> page.
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: colors.danger, margin: "0.75rem 0 0" }}>
            {error}
          </p>
        )}
      </Card>

      {infeasible && (
        <section aria-label="Infeasible projects">
          <h2 style={{ margin: "0 0 0.25rem" }}>No feasible set of teams</h2>
          <p style={{ color: colors.muted, margin: "0 0 0.75rem" }}>{infeasible.message}</p>
          {infeasible.projects.map((detail) => {
            const project = projectById.get(detail.project_id);
            return (
              project && (
                <div key={detail.project_id} style={{ marginBottom: "1rem" }}>
                  <h3 style={{ margin: 0 }}>{project.name}</h3>
                  <InfeasibilityReport
                    detail={detail}
                    project={project}
                    people={people}
                    projects={projects}
                  />
                </div>
              )
            );
          })}
        </section>
      )}

      {result && (
        <BatchResult
          result={result}
          people={people}
          projectById={projectById}
          assignments={assignments}
          appliedAll={appliedAll}
          onApplyAll={() => setConfirmingApplyAll(true)}
          onApply={async (teamId) => {
            await teamsApi.apply(teamId);
            await reloadAssignments();
          }}
        />
      )}

      {confirmingApplyAll && result && (
        <Modal
          title="Apply all teams?"
          onClose={closeApplyAll}
          footer={
            <>
              <Button onClick={closeApplyAll}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => applyAll(result.teams.map((t) => t.id))}
                disabled={applyingAll}
              >
                {applyingAll ? "Applying…" : "Apply"}
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Each team replaces its project's current staffing for the phases it covers. All teams
            are applied together, or none is.
          </p>
          {applyAllError && (
            <p role="alert" style={{ color: colors.danger, marginBottom: 0 }}>
              {applyAllError}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function BatchResult({
  result,
  people,
  projectById,
  assignments,
  appliedAll,
  onApplyAll,
  onApply,
}: {
  result: BatchOptimizationResponse;
  people: Person[];
  projectById: Map<string, Project>;
  assignments: Assignment[];
  appliedAll: boolean;
  onApplyAll: () => void;
  onApply: (teamId: string) => Promise<void>;
}) {
  const coverage = result.teams.flatMap((team) => team.coverage);
  const staffed = coverage.reduce((sum, phase) => sum + phase.staffed_fte, 0);
  const required = coverage.reduce((sum, phase) => sum + phase.required_fte, 0);
  const fullyCovered = result.teams.filter((team) => team.fully_covered).length;
  const shortStaffed = result.teams.flatMap((team) => {
    const project = projectById.get(team.project_id);
    return team.fully_covered === false && project ? [project] : [];
  });
  const projectCount = result.teams.length;

  return (
    <section aria-label="Optimization results">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <StatTile
          label="Staffed FTE"
          value={formatFte(staffed)}
          unit={`/ ${formatFte(required)} FTE required`}
          fill={{
            value: staffed,
            max: required,
            tone: staffed < required ? "warning" : "success",
          }}
          style={{ flex: "1 1 16rem" }}
        />
        <StatTile
          label="Coverage"
          value={`${fullyCovered} / ${projectCount}`}
          unit="projects fully covered"
          accent={fullyCovered < projectCount ? "warning" : "success"}
          style={{ flex: "1 1 16rem" }}
        />
      </div>

      {shortStaffed.length > 0 && (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: "var(--radius-lg)",
            background: colors.warningBg,
            color: colors.text,
            fontSize: "0.9rem",
          }}
        >
          <strong style={{ color: colors.warningText }}>
            {listProjectNames(shortStaffed)} {shortStaffed.length === 1 ? "is" : "are"}{" "}
            short-staffed.
          </strong>{" "}
          Shared people go to higher-priority projects first, so the remaining capacity didn't cover{" "}
          {shortStaffed.length === 1 ? "this project" : "these projects"}. Each card shows what is
          missing.
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          margin: "0 0 0.75rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Proposed teams</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.88rem", color: colors.muted }}>
            Compared with current staffing: <span style={{ color: colors.success }}>added</span> and{" "}
            <span style={{ color: colors.danger }}>dropped</span> people per phase.
          </p>
        </div>
        <Button variant="primary" icon={CheckCheck} onClick={onApplyAll}>
          Apply all
        </Button>
      </div>
      {appliedAll && (
        <p role="status" style={{ color: colors.success, margin: "0 0 0.75rem" }}>
          Applied all {projectCount} teams.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {result.teams.map((team) => {
          const project = projectById.get(team.project_id);
          const name = project?.name ?? team.project_id;
          const projectAssignments = assignments.filter((a) => a.project_id === team.project_id);
          return (
            <section key={team.id} aria-label={name}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                  marginBottom: "0.5rem",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                  <Link to={`/projects/${encodeURIComponent(team.project_id)}`}>{name}</Link>
                </h3>
                {project && (
                  <Pill
                    tone={priorityTones[project.priority]}
                    icon={priorityIcons[project.priority]}
                  >
                    {project.priority[0].toUpperCase() + project.priority.slice(1)}
                  </Pill>
                )}
                {result.ignored_start_window_project_ids.includes(team.project_id) && (
                  <span style={{ fontSize: "0.85rem", color: colors.muted }}>
                    Start window ignored — solved at planned dates
                  </span>
                )}
              </div>
              <ProposalCard
                title="Proposed team"
                members={team.members}
                score={team.optimization_score}
                maxScore={team.optimization_max_score}
                coverage={team.coverage}
                fullyCovered={team.fully_covered}
                people={people}
                baseline={staffingBaseline(projectAssignments, team.members)}
                startDate={team.start_date}
                plannedStart={project ? (projectSpan(project)?.start ?? null) : null}
                onApply={() => onApply(team.id)}
              />
            </section>
          );
        })}
      </div>
    </section>
  );
}
