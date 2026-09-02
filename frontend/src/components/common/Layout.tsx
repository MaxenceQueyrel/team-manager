import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/people", label: "People" },
  { to: "/projects", label: "Projects" },
  { to: "/availability", label: "Availability" },
  { to: "/teams", label: "Teams" },
  { to: "/optimization", label: "Optimization", permission: "optimization:run" },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const visibleNavItems = navItems.filter(
    (item) => !item.permission || permissions.has(item.permission),
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          padding: "1.5rem 1rem",
          background: "#f8f9fa",
          borderRight: "1px solid #e9ecef",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 style={{ margin: "0 0 1.5rem", fontSize: "1.1rem" }}>Team Manager</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visibleNavItems.map(({ to, label }) => (
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
        <div style={{ marginTop: "auto", paddingTop: "1rem", fontSize: "0.8rem" }}>
          <NavLink
            to="/profile"
            style={({ isActive }) => ({
              display: "block",
              color: isActive ? "#4f6ef7" : "#6c757d",
              marginBottom: "0.5rem",
              wordBreak: "break-all",
              textDecoration: "none",
            })}
          >
            {user?.email}
          </NavLink>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: "#4f6ef7",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: "2rem", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
