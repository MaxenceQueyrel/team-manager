import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/people", label: "People" },
  { to: "/projects", label: "Projects" },
  { to: "/availability", label: "Availability" },
  { to: "/teams", label: "Teams" },
  { to: "/optimization", label: "Optimization" },
];

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          padding: "1.5rem 1rem",
          background: "#f8f9fa",
          borderRight: "1px solid #e9ecef",
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: "0 0 1.5rem", fontSize: "1.1rem" }}>Team Manager</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {navItems.map(({ to, label }) => (
            <li key={to} style={{ marginBottom: "0.25rem" }}>
              <NavLink
                to={to}
                end={to === "/"}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  color: isActive ? "#4f6ef7" : "inherit",
                  background: isActive ? "#eef0fd" : "transparent",
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "2rem", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
