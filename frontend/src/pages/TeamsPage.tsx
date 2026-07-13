import { useEffect } from "react";
import { TeamMembers } from "@/components/common/TeamMembers";
import { Badge, Button, Card, colors } from "@/components/common/ui";
import { useAppStore } from "@/store";

export default function TeamsPage() {
  const { teams, people, projects, isLoading, fetchTeams, fetchPeople, fetchProjects, deleteTeam } =
    useAppStore();

  useEffect(() => {
    fetchTeams();
    fetchPeople();
    fetchProjects();
  }, [fetchTeams, fetchPeople, fetchProjects]);

  if (isLoading && teams.length === 0) return <p>Loading…</p>;

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  return (
    <div>
      <h1>Teams</h1>
      {teams.length === 0 ? (
        <p>No teams yet. Run the optimizer to generate team suggestions.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {teams.map((t) => (
            <Card key={t.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>{projectById[t.project_id]?.name ?? t.project_id}</h3>
                  {t.is_optimized && <Badge color={colors.success}>optimized</Badge>}
                </div>
                <Button
                  variant="danger"
                  onClick={() => confirm("Delete this team?") && deleteTeam(t.id)}
                >
                  Delete
                </Button>
              </div>
              {t.optimization_score != null && (
                <p
                  style={{ margin: "0.4rem 0 0.75rem", fontSize: "0.875rem", color: colors.muted }}
                >
                  Score: {t.optimization_score.toFixed(2)}
                  {t.optimization_max_score != null && `/${t.optimization_max_score.toFixed(2)}`} ·{" "}
                  {t.members.length} member(s)
                </p>
              )}
              <TeamMembers members={t.members} people={people} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
