import { useEffect } from "react";
import { useAppStore } from "@/store";

export default function ProjectsPage() {
  const { projects, isLoading, fetchProjects } = useAppStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Projects</h1>
      {projects.length === 0 ? (
        <p>No projects found. Create your first project.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: "1rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.6rem",
                    borderRadius: 12,
                    background: priorityColor(p.priority),
                    color: "#fff",
                  }}
                >
                  {p.priority}
                </span>
              </div>
              {p.description && <p style={{ margin: "0.5rem 0 0", color: "#6c757d" }}>{p.description}</p>}
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
                Required FTE: <strong>{p.required_fte}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function priorityColor(priority: string) {
  const map: Record<string, string> = {
    low: "#6c757d",
    medium: "#0d6efd",
    high: "#fd7e14",
    critical: "#dc3545",
  };
  return map[priority] ?? "#6c757d";
}
