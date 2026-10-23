import { ChevronRight, Download, Plus, Upload } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import { daysBetween, formatSpan, isoToday } from "@/components/common/dates";
import {
  AvatarStack,
  Button,
  colors,
  FillBar,
  PageHeader,
  Pill,
  priorityIcons,
  priorityTones,
  SearchInput,
  Tabs,
} from "@/components/common/ui";
import { ProjectForm } from "@/components/projects/ProjectForm";
import {
  buildLanes,
  fillTones,
  formatFte,
  needsStaffing,
  type ProjectStatus,
  projectFill,
  projectSpan,
  projectStatus,
  projectStatusLabels,
  projectStatusTones,
  staffedFte,
} from "@/components/projects/staffing";
import { assignmentsApi, projectsApi } from "@/services/api";
import { downloadBlob } from "@/services/download";
import { knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Assignment, DateRange, Project, ProjectsImportSummary } from "@/types";

type StatusFilter = "all" | "needs-staffing" | "running" | "ended";

const STATUS_FILTERS: StatusFilter[] = ["all", "needs-staffing", "running", "ended"];

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  "needs-staffing": "Needs staffing",
  running: "Running",
  ended: "Ended",
};

const COLUMNS = "minmax(0, 2.3fr) minmax(0, 1.2fr) minmax(0, 1.7fr) 7.5rem 1.25rem";

const rowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: COLUMNS,
  alignItems: "center",
  gap: "1.5rem",
  padding: "0 1.5rem",
};

interface ProjectRow {
  project: Project;
  staffed: number;
  total: number;
  status: ProjectStatus;
  needsStaffing: boolean;
  span: DateRange | null;
  members: string[];
}

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.find((filter) => filter === value) ?? "all";
}

function matchesStatus(row: ProjectRow, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "needs-staffing") return row.needsStaffing;
  return row.status === filter;
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeDays(days: number): string {
  const abs = Math.abs(days);
  if (abs < 45) return relativeTime.format(days, "day");
  if (abs < 365) return relativeTime.format(Math.round(days / 30), "month");
  return relativeTime.format(Math.round(days / 365), "year");
}

function spanTiming(span: DateRange, today: string): string {
  if (today < span.start) return `starts ${relativeDays(daysBetween(today, span.start))}`;
  if (today <= span.end) return `ends ${relativeDays(daysBetween(today, span.end))}`;
  return `ended ${relativeDays(daysBetween(today, span.end))}`;
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
    importProjects,
  } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWriteProjects = useAuthStore((s) => s.permissions.has("projects:write"));
  const [searchParams, setSearchParams] = useSearchParams();
  // Local state mirrored to the URL: binding the search input to the URL directly drops
  // keystrokes, since react-router applies location changes in a transition.
  const [statusFilter, setStatusFilter] = useState(() =>
    parseStatusFilter(searchParams.get("status")),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [importSummary, setImportSummary] = useState<ProjectsImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = isoToday();

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (query) params.set("q", query);
    setSearchParams(params, { replace: true });
  }, [statusFilter, query, setSearchParams]);

  useEffect(() => {
    fetchProjects();
    fetchPeople();
    fetchSkills();
    assignmentsApi
      .list()
      .then(setAssignments)
      .catch((e) => setError(message(e)));
  }, [fetchProjects, fetchPeople, fetchSkills]);

  const rows = useMemo<ProjectRow[]>(() => {
    const names = new Map(people.map((p) => [p.id, p.name]));
    return projects.map((project) => {
      const lanes = buildLanes(project, assignments);
      const memberIds = new Set(lanes.flatMap((lane) => lane.assignments.map((a) => a.person_id)));
      return {
        project,
        ...staffedFte(lanes),
        status: projectStatus(project, lanes, today),
        needsStaffing: needsStaffing(project, lanes),
        span: projectSpan(project),
        members: [...memberIds].flatMap((id) => {
          const name = names.get(id);
          return name ? [name] : [];
        }),
      };
    });
  }, [projects, assignments, people, today]);

  const needle = query.trim().toLowerCase();
  const visibleRows = rows.filter(
    (row) =>
      matchesStatus(row, statusFilter) &&
      (row.project.name.toLowerCase().includes(needle) ||
        row.project.description.toLowerCase().includes(needle)),
  );
  const requested = rows.reduce((sum, row) => sum + row.total, 0);
  const staffed = rows.reduce((sum, row) => sum + row.staffed, 0);

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
      <PageHeader
        title="Projects"
        subtitle={`${rows.length} ${rows.length === 1 ? "project" : "projects"} · ${formatFte(requested)} FTE requested · ${formatFte(staffed)} FTE staffed`}
        actions={
          canWriteProjects && (
            <>
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
              <Button
                icon={Upload}
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? "Importing…" : "Import"}
              </Button>
              <Button icon={Download} disabled={exporting} onClick={handleExport}>
                {exporting ? "Exporting…" : "Export"}
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
                New project
              </Button>
            </>
          )
        }
      />

      {importSummary && (
        <p style={{ color: colors.success, margin: "0 0 1rem", fontSize: "0.85rem" }}>
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
        <p style={{ color: colors.danger, margin: "0 0 1rem", fontSize: "0.85rem" }}>{error}</p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <Tabs
          variant="segmented"
          ariaLabel="Filter projects by status"
          value={statusFilter}
          onChange={(value) => setStatusFilter(parseStatusFilter(value))}
          items={STATUS_FILTERS.map((filter) => ({
            value: filter,
            label: STATUS_FILTER_LABELS[filter],
            count: rows.filter((row) => matchesStatus(row, filter)).length,
          }))}
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search projects"
          style={{ width: "100%", maxWidth: "22rem" }}
        />
      </div>

      {isLoading && projects.length === 0 ? (
        <p>Loading…</p>
      ) : projects.length === 0 ? (
        <p style={{ color: colors.muted }}>No projects yet. Create your first project.</p>
      ) : visibleRows.length === 0 ? (
        <p style={{ color: colors.muted }}>No projects match these filters.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 820 }}>
            <div
              aria-hidden
              style={{
                ...rowGrid,
                marginBottom: "0.6rem",
                fontSize: "0.85rem",
                color: colors.muted,
              }}
            >
              <span>Project</span>
              <span>Dates</span>
              <span>Staffing</span>
              <span>Status</span>
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {visibleRows.map((row) => (
                <ProjectListRow
                  key={row.project.id}
                  row={row}
                  today={today}
                  onSetDates={canWriteProjects ? () => setEditing(row.project) : undefined}
                />
              ))}
            </ul>
          </div>
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

function ProjectListRow({
  row,
  today,
  onSetDates,
}: {
  row: ProjectRow;
  today: string;
  onSetDates?: () => void;
}) {
  const { project, staffed, total, status, span, members } = row;
  const fill = projectFill(staffed, total);

  return (
    <li
      style={{
        ...rowGrid,
        position: "relative",
        padding: "1.1rem 1.5rem",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
          <h3 style={{ margin: 0 }}>
            <Link to={`/projects/${encodeURIComponent(project.id)}`} style={{ color: "inherit" }}>
              {project.name}
              {/* Stretches the link over the whole row; "Set dates" sits above it. */}
              <span aria-hidden style={{ position: "absolute", inset: 0 }} />
            </Link>
          </h3>
          <Pill tone={priorityTones[project.priority]} icon={priorityIcons[project.priority]}>
            {project.priority[0].toUpperCase() + project.priority.slice(1)}
          </Pill>
        </div>
        <div
          style={{
            marginTop: "0.35rem",
            fontSize: "0.9rem",
            color: project.description ? colors.muted : colors.subtle,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.description || "No description yet"}
        </div>
      </div>

      <div>
        {span ? (
          <>
            <div className="mono" style={{ fontSize: "0.9rem" }}>
              {formatSpan(span, today)}
            </div>
            <div style={{ marginTop: "0.2rem", fontSize: "0.82rem", color: colors.muted }}>
              {spanTiming(span, today)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "0.9rem" }}>Not scheduled</div>
            {onSetDates && (
              <button
                type="button"
                onClick={onSetDates}
                aria-label={`Set dates for ${project.name}`}
                style={{
                  position: "relative",
                  marginTop: "0.2rem",
                  padding: 0,
                  border: "none",
                  background: "none",
                  color: colors.primary,
                  fontSize: "0.82rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Set dates
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <FillBar value={staffed} max={total} tone={fillTones[fill]} style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>
            {formatFte(staffed)} / {formatFte(total)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.5rem",
            fontSize: "0.85rem",
            color: colors.muted,
          }}
        >
          {members.length > 0 ? (
            <>
              <AvatarStack names={members} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {members.map((name) => name.split(" ")[0]).join(", ")}
              </span>
            </>
          ) : (
            "Nobody assigned"
          )}
        </div>
      </div>

      <div>
        <Pill tone={projectStatusTones[status]} dot>
          {projectStatusLabels[status]}
        </Pill>
      </div>

      <ChevronRight size={18} aria-hidden style={{ color: colors.muted }} />
    </li>
  );
}
