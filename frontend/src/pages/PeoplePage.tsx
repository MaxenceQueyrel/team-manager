import { Pencil, Plus, Trash } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import {
  Avatar,
  Button,
  Card,
  colors,
  FillBar,
  FilterMenu,
  Menu,
  type MenuItem,
  Pill,
  SearchInput,
  seniorityLabels,
  seniorityTones,
} from "@/components/common/ui";
import { type CatalogKind, CatalogModal } from "@/components/people/CatalogModal";
import {
  FREE_HORIZON_DAYS,
  type PeopleWorkspaceContext,
} from "@/components/people/PeopleWorkspace";
import { formatFte, formatHeadcount } from "@/components/projects/staffing";
import { knownRoleIds, knownSkillIds, useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { Person, Seniority } from "@/types";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];

interface DirectoryFilters {
  query: string;
  roles: string[];
  seniorities: Seniority[];
  skills: string[];
  availableOnly: boolean;
}

const NO_FILTERS: DirectoryFilters = {
  query: "",
  roles: [],
  seniorities: [],
  skills: [],
  availableOnly: false,
};

function filtersFromParams(params: URLSearchParams): DirectoryFilters {
  return {
    query: params.get("q") ?? "",
    roles: params.getAll("role"),
    seniorities: SENIORITIES.filter((s) => params.getAll("seniority").includes(s)),
    skills: params.getAll("skill"),
    availableOnly: params.get("available") === "1",
  };
}

function filtersToParams(filters: DirectoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  for (const r of filters.roles) params.append("role", r);
  for (const s of filters.seniorities) params.append("seniority", s);
  for (const s of filters.skills) params.append("skill", s);
  if (filters.availableOnly) params.set("available", "1");
  return params;
}

const headerCell = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontSize: "0.82rem",
  fontWeight: 500,
  color: colors.muted,
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${colors.border}`,
} as const;

const bodyCell = {
  padding: "0.85rem 1rem",
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: "middle",
} as const;

export default function PeoplePage() {
  const { people, roles, skills, isLoading, deletePerson, createRole, createSkill } = useAppStore();
  const roleOptions = useAppStore(useShallow(knownRoleIds));
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const canWritePeople = useAuthStore((s) => s.permissions.has("people:write"));
  const canDeletePeople = useAuthStore((s) => s.permissions.has("people:delete"));
  const canWriteRoles = useAuthStore((s) => s.permissions.has("roles:write"));
  const canWriteSkills = useAuthStore((s) => s.permissions.has("skills:write"));
  const { freeRatios, editPerson } = useOutletContext<PeopleWorkspaceContext>();
  const [catalogKind, setCatalogKind] = useState<CatalogKind | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL only mirrors this state, as in PeopleCapacityView: binding the inputs to the URL
  // directly drops keystrokes because react-router applies location changes in a transition.
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const update = (changes: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...changes }));

  useEffect(() => {
    setSearchParams(filtersToParams(filters), { replace: true });
  }, [filters, setSearchParams]);

  const filteredPeople = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return people.filter((person) => {
      if (
        query &&
        !person.name.toLowerCase().includes(query) &&
        !person.role.toLowerCase().includes(query) &&
        !person.skills.some((s) => s.id.toLowerCase().includes(query))
      )
        return false;
      if (filters.roles.length > 0 && !filters.roles.includes(person.role)) return false;
      if (filters.seniorities.length > 0 && !filters.seniorities.includes(person.seniority))
        return false;
      if (filters.skills.length > 0 && !person.skills.some((s) => filters.skills.includes(s.id)))
        return false;
      if (filters.availableOnly && (freeRatios.get(person.id) ?? 0) <= 0) return false;
      return true;
    });
  }, [people, filters, freeRatios]);

  const roleCounts = roleOptions
    .map((id) => ({ id, count: people.filter((p) => p.role === id).length }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const coverage = skillOptions
    .map((id) => ({
      id,
      holders: people.filter((p) => p.skills.some((s) => s.id === id)).map((p) => p.name),
    }))
    .sort((a, b) => b.holders.length - a.holders.length || a.id.localeCompare(b.id));

  const rowActions = (person: Person): MenuItem[] => {
    const items: MenuItem[] = [];
    if (canWritePeople)
      items.push({ label: "Edit", icon: Pencil, onSelect: () => editPerson(person) });
    if (canDeletePeople)
      items.push({
        label: "Delete",
        icon: Trash,
        danger: true,
        onSelect: () => {
          if (confirm(`Delete ${person.name}?`)) deletePerson(person.id);
        },
      });
    return items;
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginBottom: "1.25rem" }}>
        <SearchInput
          value={filters.query}
          onChange={(query) => update({ query })}
          placeholder="Search by name, role or skill"
          style={{ flex: "1 1 260px" }}
        />
        <FilterMenu
          label="Role"
          options={roleOptions.map((r) => ({ value: r, label: r }))}
          selected={filters.roles}
          onChange={(selected) => update({ roles: selected })}
        />
        <FilterMenu
          label="Seniority"
          options={SENIORITIES.map((s) => ({ value: s, label: seniorityLabels[s] }))}
          selected={filters.seniorities}
          onChange={(selected) => update({ seniorities: selected as Seniority[] })}
        />
        <FilterMenu
          label="Skill"
          options={skillOptions.map((s) => ({ value: s, label: s }))}
          selected={filters.skills}
          onChange={(selected) => update({ skills: selected })}
          align="right"
        />
        <button
          type="button"
          className="btn btn-secondary btn-md"
          aria-pressed={filters.availableOnly}
          onClick={() => update({ availableOnly: !filters.availableOnly })}
          style={
            filters.availableOnly
              ? { background: colors.primaryBg, borderColor: colors.primary, color: colors.primary }
              : undefined
          }
        >
          Available only
        </button>
      </div>

      {isLoading && people.length === 0 ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : people.length === 0 ? (
        <Card style={{ color: colors.muted }}>No people yet. Add your first team member.</Card>
      ) : (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: "var(--radius-lg)",
            background: colors.surface,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr>
                <th style={headerCell}>Person</th>
                <th style={headerCell}>Seniority</th>
                <th style={headerCell}>Experience</th>
                <th style={headerCell}>FTE</th>
                <th style={headerCell}>Free next {FREE_HORIZON_DAYS} days</th>
                <th style={headerCell}>Skills</th>
                <th style={headerCell} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredPeople.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...bodyCell, color: colors.muted, textAlign: "center" }}>
                    No one matches these filters.{" "}
                    <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                      Clear filters
                    </Button>
                  </td>
                </tr>
              )}
              {filteredPeople.map((p) => {
                const free = freeRatios.get(p.id);
                const actions = rowActions(p);
                return (
                  <tr key={p.id}>
                    <td style={bodyCell}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <Avatar name={p.name} />
                        <div style={{ minWidth: 0 }}>
                          <Link
                            to={`/people/${p.id}`}
                            style={{ color: colors.text, fontWeight: 600 }}
                          >
                            {p.name}
                          </Link>
                          <div style={{ color: colors.muted, fontSize: "0.85rem" }}>{p.role}</div>
                        </div>
                      </div>
                    </td>
                    <td style={bodyCell}>
                      <Pill tone={seniorityTones[p.seniority]}>{seniorityLabels[p.seniority]}</Pill>
                    </td>
                    <td style={{ ...bodyCell, whiteSpace: "nowrap" }} className="mono">
                      {p.years_of_experience} yrs
                    </td>
                    <td style={bodyCell} className="mono">
                      {formatFte(p.base_capacity)}
                    </td>
                    <td style={bodyCell}>
                      {free === undefined ? (
                        <span style={{ color: colors.subtle }}>—</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <FillBar
                            value={free}
                            max={p.base_capacity}
                            style={{ width: 96, flexShrink: 0 }}
                          />
                          <span
                            className="mono"
                            style={{ color: free > 0 ? colors.success : colors.muted }}
                          >
                            {formatFte(free)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={bodyCell}>
                      {p.skills.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {p.skills.map((s) => (
                            <Pill
                              key={s.id}
                              tone="outline"
                              style={{
                                borderRadius: "var(--radius-sm)",
                                borderColor: colors.border,
                              }}
                            >
                              {s.id}
                              <span className="mono" style={{ color: colors.muted }}>
                                {s.level}
                              </span>
                            </Pill>
                          ))}
                        </div>
                      ) : canWritePeople ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Plus}
                          ariaLabel={`Add skills to ${p.name}`}
                          onClick={() => editPerson(p)}
                          style={{ border: `1px dashed ${colors.borderStrong}` }}
                        >
                          Add skills
                        </Button>
                      ) : (
                        <span style={{ color: colors.subtle }}>—</span>
                      )}
                    </td>
                    <td style={{ ...bodyCell, textAlign: "right", width: 1 }}>
                      {actions.length > 0 && (
                        <Menu items={actions} ariaLabel={`Actions for ${p.name}`} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
          marginTop: "1.5rem",
          alignItems: "start",
        }}
      >
        <SummaryCard
          title="Roles"
          subtitle="Labels you pick from on the person form"
          action={
            canWriteRoles && (
              <Button icon={Plus} ariaLabel="Add role" onClick={() => setCatalogKind("role")}>
                Role
              </Button>
            )
          }
          isEmpty={roleCounts.length === 0}
          empty="No roles yet."
        >
          {roleCounts.map(({ id, count }) => (
            <SummaryRow key={id}>
              <span style={{ flex: 1 }}>{id}</span>
              <span style={{ color: colors.muted, fontSize: "0.85rem" }}>
                {formatHeadcount(count)}
              </span>
            </SummaryRow>
          ))}
        </SummaryCard>
        <SummaryCard
          title="Skill coverage"
          subtitle="Who can do what, and where you're thin"
          action={
            canWriteSkills && (
              <Button icon={Plus} ariaLabel="Add skill" onClick={() => setCatalogKind("skill")}>
                Skill
              </Button>
            )
          }
          isEmpty={coverage.length === 0}
          empty="No skills yet."
        >
          {coverage.map(({ id, holders }) => (
            <SummaryRow key={id}>
              <span style={{ width: "30%", flexShrink: 0, overflowWrap: "anywhere" }}>{id}</span>
              {holders.length === 0 ? (
                <span style={{ flex: 1, color: colors.warningText, fontWeight: 500 }}>
                  Nobody yet
                </span>
              ) : (
                <span style={{ flex: 1, color: colors.muted, fontSize: "0.9rem" }}>
                  {holders.slice(0, 3).join(", ")}
                  {holders.length > 3 && ` +${holders.length - 3} more`}
                </span>
              )}
              <span
                className="mono"
                style={{ color: holders.length === 0 ? colors.warningText : colors.text }}
              >
                {holders.length}
              </span>
            </SummaryRow>
          ))}
        </SummaryCard>
      </div>

      {catalogKind && (
        <CatalogModal
          kind={catalogKind}
          items={catalogKind === "role" ? roles : skills}
          onClose={() => setCatalogKind(null)}
          onSave={async (data) => {
            if (catalogKind === "role") {
              await createRole(data);
            } else {
              await createSkill(data);
            }
            setCatalogKind(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  title,
  subtitle,
  action,
  isEmpty,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  action: ReactNode;
  isEmpty: boolean;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card style={{ padding: "1.25rem 1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p style={{ margin: "0.3rem 0 0", color: colors.muted, fontSize: "0.88rem" }}>
            {subtitle}
          </p>
        </div>
        {action}
      </div>
      {isEmpty ? (
        <SummaryRow>
          <span style={{ color: colors.muted }}>{empty}</span>
        </SummaryRow>
      ) : (
        children
      )}
    </Card>
  );
}

function SummaryRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.7rem 0",
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </div>
  );
}
