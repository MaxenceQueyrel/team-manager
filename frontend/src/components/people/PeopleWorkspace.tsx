import { useState } from "react";
import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { colors } from "@/components/common/ui";

/** Shared header for the People workspace: the title plus a Directory / Capacity switch
 * rendered above whichever view is active. */
export default function PeopleWorkspace() {
  const location = useLocation();
  const onCapacity = useMatch("/people/capacity") !== null;
  // This layout stays mounted across both tabs, so it can remember the capacity filters
  // and restore them when the user comes back from the Directory.
  const [capacitySearch, setCapacitySearch] = useState(onCapacity ? location.search : "");
  if (onCapacity && capacitySearch !== location.search) {
    setCapacitySearch(location.search);
  }

  const tabs = [
    { to: "/people", label: "Directory", end: true },
    { to: `/people/capacity${capacitySearch}`, label: "Capacity", end: false },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 0.75rem" }}>People</h1>
      <nav
        aria-label="People views"
        style={{
          display: "inline-flex",
          padding: 3,
          marginBottom: "1rem",
          background: colors.light,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
      >
        {tabs.map(({ to, label, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            style={({ isActive }) => ({
              padding: "0.35rem 1rem",
              borderRadius: 6,
              fontSize: "0.875rem",
              textDecoration: "none",
              color: isActive ? colors.primary : colors.muted,
              background: isActive ? "#fff" : "transparent",
              boxShadow: isActive ? "0 1px 2px rgba(0, 0, 0, 0.08)" : "none",
              fontWeight: isActive ? 600 : 500,
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
