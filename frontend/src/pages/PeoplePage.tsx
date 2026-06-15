import { useEffect } from "react";
import { useAppStore } from "@/store";

export default function PeoplePage() {
  const { people, isLoading, fetchPeople } = useAppStore();

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  if (isLoading) return <p>Loading…</p>;

  return (
    <div>
      <h1>People</h1>
      {people.length === 0 ? (
        <p>No people found. Add your first team member.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e9ecef" }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>Role</th>
              <th style={{ padding: "0.5rem" }}>Seniority</th>
              <th style={{ padding: "0.5rem" }}>Experience (yrs)</th>
              <th style={{ padding: "0.5rem" }}>FTE Capacity</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                <td style={{ padding: "0.5rem" }}>{p.name}</td>
                <td style={{ padding: "0.5rem" }}>{p.role}</td>
                <td style={{ padding: "0.5rem" }}>{p.seniority}</td>
                <td style={{ padding: "0.5rem" }}>{p.years_of_experience}</td>
                <td style={{ padding: "0.5rem" }}>{(p.fte_capacity * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
