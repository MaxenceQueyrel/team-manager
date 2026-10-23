import {
  Building,
  Check,
  ChevronsUpDown,
  Folder,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Plus,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Avatar, colors, IconButton, popoverStyle, useDismiss } from "@/components/common/ui";
import { useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { OrganizationMembership } from "@/types";

function membershipSummary(org: OrganizationMembership): string {
  const role = org.role === "owner" ? "Owner" : "Contributor";
  if (org.member_count === undefined) return role;
  return `${role} · ${org.member_count} ${org.member_count === 1 ? "member" : "members"}`;
}

function LogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" rx="8" style={{ fill: colors.text }} />
      <rect x="8" y="9" width="14" height="2.4" rx="1.2" style={{ fill: colors.surface }} />
      <rect x="8" y="13.8" width="11" height="2.4" rx="1.2" style={{ fill: colors.surface }} />
      <rect x="8" y="18.6" width="8" height="2.4" rx="1.2" style={{ fill: colors.primarySoft }} />
    </svg>
  );
}

function OrganizationSwitcher() {
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const setActiveOrganization = useAuthStore((s) => s.setActiveOrganization);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const active = organizations.find((o) => o.id === activeOrganizationId);
  if (!active) return null;

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: "1.5rem" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          width: "100%",
          padding: "0.6rem 0.75rem",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <Avatar name={active.name} tone="solid" shape="square" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active.name}
          </span>
          <span style={{ display: "block", fontSize: "0.8rem", color: colors.muted }}>
            {membershipSummary(active)}
          </span>
        </span>
        <ChevronsUpDown size={16} aria-hidden style={{ color: colors.muted, flexShrink: 0 }} />
      </button>
      {open && (
        <div role="menu" aria-label="Organizations" style={{ ...popoverStyle, left: 0, right: 0 }}>
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              role="menuitemradio"
              aria-checked={org.id === activeOrganizationId}
              className="menu-item"
              onClick={() => {
                setActiveOrganization(org.id);
                setOpen(false);
              }}
            >
              <Avatar name={org.name} tone="solid" shape="square" size="sm" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 500 }}>{org.name}</span>
                <span style={{ display: "block", fontSize: "0.75rem", color: colors.muted }}>
                  {membershipSummary(org)}
                </span>
              </span>
              {org.id === activeOrganizationId && (
                <Check size={16} aria-hidden style={{ color: colors.primary }} />
              )}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${colors.border}`, margin: "0.3rem 0" }} />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate("/organization");
            }}
          >
            <Plus size={16} aria-hidden style={{ color: colors.muted }} />
            New organization
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const logout = useAuthStore((s) => s.logout);
  const peopleCount = useAppStore((s) => s.people.length);
  const projectCount = useAppStore((s) => s.projects.length);
  const fetchPeople = useAppStore((s) => s.fetchPeople);
  const fetchProjects = useAppStore((s) => s.fetchProjects);
  const navigate = useNavigate();

  // The nav counts read the shared store, so it is reloaded whenever the organization changes.
  useEffect(() => {
    if (!activeOrganizationId) return;
    fetchPeople();
    fetchProjects();
  }, [activeOrganizationId, fetchPeople, fetchProjects]);

  const navItems: { to: string; label: string; icon: LucideIcon; count?: number }[] = [
    { to: "/", label: "Dashboard", icon: LayoutGrid },
    { to: "/people", label: "People", icon: Users, count: peopleCount },
    { to: "/projects", label: "Projects", icon: Folder, count: projectCount },
    { to: "/organization", label: "Organization", icon: Building },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        aria-label="Main"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          width: 260,
          padding: "1.25rem 1rem 1rem",
          background: colors.sidebar,
          borderRight: `1px solid ${colors.border}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            padding: "0 0.25rem",
            marginBottom: "1.4rem",
            fontFamily: "var(--font-display)",
            fontSize: "1.15rem",
            fontWeight: 600,
          }}
        >
          <LogoMark />
          Team Manager
        </div>
        <OrganizationSwitcher />
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
          }}
        >
          {navItems.map(({ to, label, icon: Icon, count }) => (
            <li key={to}>
              <NavLink to={to} end={to === "/"} className="nav-item">
                <Icon size={18} aria-hidden style={{ color: colors.muted }} />
                {label}
                {count !== undefined && activeOrganizationId && (
                  // Hidden from the accessible name so links stay "People" / "Projects".
                  <span
                    aria-hidden
                    className="mono"
                    style={{ marginLeft: "auto", fontSize: "0.8rem", color: colors.muted }}
                  >
                    {count}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.75rem",
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <NavLink
            to="/profile"
            className="nav-item"
            style={{ flex: 1, minWidth: 0, padding: "0.4rem 0.5rem", fontWeight: 400 }}
          >
            <Avatar name={user?.email ?? ""} tone="dark" />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.88rem",
              }}
            >
              {user?.email}
            </span>
          </NavLink>
          <IconButton
            icon={LogOut}
            ariaLabel="Sign out"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          />
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0, padding: "2.5rem 3rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
