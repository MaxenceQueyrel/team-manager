import { useEffect } from "react";
import { useAppStore } from "@/store";

export default function TeamsPage() {
  const { teams, people, projects, isLoading, fetchTeams, fetchPeople, fetchProjects } =
    useAppStore();

  useEffect(() => {
    fetchTeams();
    fetchPeople();
    fetchProjects();
  }, [fetchTeams, fetchPeople, fetchProjects]);

  if (isLoading) return <p>Loading…</p>;

  const personById = Object.fromEntries(people.map((p) => [p.id, p]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  return (
    <div>
      <h1>Teams</h1>
      {teams.length === 0 ? (
        <p>No teams yet. Run the optimizer to generate team suggestions.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {teams.map((t) => (
            <div key={t.id} style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>
                {projectById[t.project_id]?.name ?? t.project_id}
              </h3>
              {t.optimization_score !== undefined && (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#6c757d" }}>
                  Score: {t.optimization_score.toFixed(3)}
                </p>
              )}
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {t.members.map((m) => (
                  <li key={m.person_id}>
                    {personById[m.person_id]?.name ?? m.person_id} —{" "}
                    {(m.fte_allocation * 100).toFixed(0)}% FTE
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
