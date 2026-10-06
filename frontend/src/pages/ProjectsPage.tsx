import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { Badge, Button, Card, colors, priorityColors } from "@/components/common/ui";
import { ProjectForm } from "@/components/projects/ProjectForm";
import {
  buildLanes,
  fillColors,
  isFullyStaffed,
  staffedSlots,
} from "@/components/projects/staffing";
import { assignmentsApi, projectsApi } from "@/services/api";
import { downloadBlob } from "@/services/download";
import { knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, Project, ProjectsImportSummary } from "@/types";

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export default function ProjectsPage() {
  const {
    projects,
    people,
    isLoading,
    fetchProjects,
    fetchPeople,
    fetchSkills,
    saveProject,
    deleteProject,
    importProjects,
  } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWriteProjects = useAuthStore((s) => s.permissions.has("projects:write"));
  const canDeleteProjects = useAuthStore((s) => s.permissions.has("projects:delete"));
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [importSummary, setImportSummary] = useState<ProjectsImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
    fetchPeople();
    fetchSkills();
    assignmentsApi
      .list()
      .then(setAssignments)
      .catch((e) => setError(message(e)));
  }, [fetchProjects, fetchPeople, fetchSkills]);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    setImportSummary(null);
    try {
      setImportSummary(await importProjects(file));
    } catch (e) {
      setError(message(e));
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      downloadBlob(await projectsApi.exportCsv(), "projects.csv");
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1>Projects</h1>
        {canWriteProjects && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleImportFile(file);
              }}
            />
            <Button disabled={importing} onClick={() => fileInputRef.current?.click()}>
              {importing ? "Importing…" : "Import CSV"}
            </Button>
            <Button disabled={exporting} onClick={handleExport}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              + Add project
            </Button>
          </div>
        )}
      </div>

      {importSummary && (
        <p style={{ color: colors.success, margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          Import complete — created {importSummary.created.length}
          {importSummary.skipped.length > 0 && (
            <>
              , skipped {importSummary.skipped.length} (already existing:{" "}
              {importSummary.skipped.join(", ")})
            </>
          )}
          .
        </p>
      )}
      {error && (
        <p style={{ color: colors.danger, margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{error}</p>
      )}

      {isLoading && projects.length === 0 ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <p>No projects found. Create your first project.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {projects.map((p) => {
            const lanes = buildLanes(p, assignments);
            const { staffed, total } = staffedSlots(lanes);
            const complete = isFullyStaffed(lanes, people);
            return (
              <Card key={p.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                  }}
                >
                  <Link
                    to={`/projects/${encodeURIComponent(p.id)}`}
                    style={{ flex: 1, color: "inherit", textDecoration: "none" }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <h3 style={{ margin: 0 }}>{p.name}</h3>
                      <Badge color={priorityColors[p.priority]}>{p.priority}</Badge>
                    </div>
                    {p.description && (
                      <p style={{ margin: "0.5rem 0 0", color: colors.muted }}>{p.description}</p>
                    )}
                    <div
                      style={{
                        marginTop: "0.6rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.8rem",
                        color: colors.muted,
                      }}
                    >
                      {staffed} / {total} slots staffed
                      <Badge color={complete ? fillColors.complete : fillColors.partial}>
                        {complete ? "complete" : "incomplete"}
                      </Badge>
                    </div>
                  </Link>
                  <div style={{ whiteSpace: "nowrap" }}>
                    {canWriteProjects && (
                      <Button onClick={() => setEditing(p)} style={{ marginRight: "0.4rem" }}>
                        Edit
                      </Button>
                    )}
                    {canDeleteProjects && (
                      <Button
                        variant="danger"
                        onClick={() => confirm(`Delete ${p.name}?`) && deleteProject(p.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ProjectForm
          project={editing === "new" ? null : editing}
          people={people}
          skillOptions={skillOptions}
          onClose={() => setEditing(null)}
          onSave={async (draft, id) => {
            await saveProject(draft, id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
