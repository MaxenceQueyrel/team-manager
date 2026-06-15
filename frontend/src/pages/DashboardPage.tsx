import { useEffect } from "react";
import { useAppStore } from "@/store";

export default function DashboardPage() {
  const { people, projects, teams, fetchPeople, fetchProjects, fetchTeams } = useAppStore();

  useEffect(() => {
    fetchPeople();
    fetchProjects();
    fetchTeams();
  }, [fetchPeople, fetchProjects, fetchTeams]);

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem" }}>
        <StatCard label="People" value={people.length} />
        <StatCard label="Projects" value={projects.length} />
        <StatCard label="Teams" value={teams.length} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "1.5rem",
        border: "1px solid #e9ecef",
        borderRadius: 8,
        minWidth: 140,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "2rem", fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#6c757d", marginTop: 4 }}>{label}</div>
    </div>
  );
}
