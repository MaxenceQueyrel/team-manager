import { useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { knownSkillIds, useAppStore } from "@/store";
import { Card, colors } from "@/components/common/ui";

export default function DashboardPage() {
  const { people, projects, teams, fetchPeople, fetchProjects, fetchTeams, fetchSkills } = useAppStore();
  const skills = useAppStore(useShallow(knownSkillIds));

  useEffect(() => {
    fetchPeople();
    fetchProjects();
    fetchTeams();
    fetchSkills();
  }, [fetchPeople, fetchProjects, fetchTeams, fetchSkills]);

  const totalCapacity = people.reduce((sum, p) => sum + p.fte_capacity, 0);
  const optimizedTeams = teams.filter((t) => t.is_optimized).length;

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1.5rem" }}>
        <StatCard label="People" value={people.length} sub={`${totalCapacity.toFixed(1)} FTE total`} />
        <StatCard label="Projects" value={projects.length} />
        <StatCard label="Teams" value={teams.length} sub={`${optimizedTeams} optimized`} />
        <StatCard label="Skills tracked" value={skills.length} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card style={{ minWidth: 150, textAlign: "center" }}>
      <div style={{ fontSize: "2rem", fontWeight: 700 }}>{value}</div>
      <div style={{ color: colors.muted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: colors.muted, marginTop: 2, fontSize: "0.78rem" }}>{sub}</div>}
    </Card>
  );
}
