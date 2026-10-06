import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { Badge, Button, Card, colors, priorityColors } from "@/components/common/ui";
import { PhaseTimeline } from "@/components/projects/PhaseTimeline";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { StaffingLaneCard } from "@/components/projects/StaffingLaneCard";
import { buildLanes, staffedSlots } from "@/components/projects/staffing";
import { assignmentsApi, projectsApi } from "@/services/api";
import { knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, Project } from "@/types";

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

export default function ProjectWorkspacePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { people, fetchPeople, fetchSkills, fetchProjects, saveProject, deleteProject } =
    useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWriteProjects = useAuthStore((s) => s.permissions.has("projects:write"));
  const canDeleteProjects = useAuthStore((s) => s.permissions.has("projects:delete"));
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchPeople();
    fetchSkills();
    fetchProjects();
  }, [fetchPeople, fetchSkills, fetchProjects]);

  useEffect(() => {
    setProject(null);
    setNotFound(false);
    setError(null);
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

  return (
    <div>
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
