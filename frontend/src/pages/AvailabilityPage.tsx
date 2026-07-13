import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import {
  AvailabilityTimeline,
  ratioColor,
  type TimelineOverlay,
  type TimelineRow,
} from "@/components/common/AvailabilityTimeline";
import { Card, colors, Field, inputStyle } from "@/components/common/ui";
import { TagSkillInput } from "@/components/editors/listEditors";
import { peopleApi } from "@/services/api";
import { knownSkillIds, useAppStore } from "@/store";
import type { PersonAvailability, Seniority } from "@/types";

const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead"];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const today = new Date();
  const later = new Date(today);
  later.setDate(later.getDate() + 30);
  return { start: toISODate(today), end: toISODate(later) };
}

export default function AvailabilityPage() {
  const { people, projects, fetchPeople, fetchProjects, fetchSkills } = useAppStore();
  const skillOptions = useAppStore(useShallow(knownSkillIds));
  const [{ start, end }, setRange] = useState(defaultRange);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [availability, setAvailability] = useState<PersonAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seniorityFilter, setSeniorityFilter] = useState<Seniority[]>([]);
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [minSkillLevel, setMinSkillLevel] = useState(0);
  const [squadOnly, setSquadOnly] = useState(false);

  useEffect(() => {
    fetchPeople();
    fetchProjects();
    fetchSkills();
  }, [fetchPeople, fetchProjects, fetchSkills]);

  useEffect(() => {
    if (start > end) {
      setError("Start date must not be after the end date.");
      return;
    }
    setLoading(true);
    setError(null);
    peopleApi
      .availability(start, end)
      .then(setAvailability)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const squadFilterAvailable = (selectedProject?.squads.length ?? 0) > 0;

  const squadMemberIds = useMemo(() => {
    const ids = new Set<string>();
    selectedProject?.squads.forEach((squad) => {
      squad.member_ids.forEach((id) => {
        ids.add(id);
      });
    });
    return ids;
  }, [selectedProject]);

  const filteredPeople = useMemo(() => {
    return people.filter((person) => {
      if (seniorityFilter.length > 0 && !seniorityFilter.includes(person.seniority)) return false;
      if (
        skillFilter.length > 0 &&
        !person.skills.some((s) => skillFilter.includes(s.id) && s.level >= minSkillLevel)
      )
        return false;
      if (squadOnly && squadFilterAvailable && !squadMemberIds.has(person.id)) return false;
      return true;
    });
  }, [
    people,
    seniorityFilter,
    skillFilter,
    minSkillLevel,
    squadOnly,
    squadFilterAvailable,
    squadMemberIds,
  ]);

  const rows: TimelineRow[] = useMemo(() => {
    const byPersonId = new Map(availability.map((a) => [a.person_id, a.segments]));
    return filteredPeople
      .map((person) => ({
        id: person.id,
        label: person.name,
        segments: byPersonId.get(person.id) ?? [],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredPeople, availability]);

  const overlays: TimelineOverlay[] = useMemo(() => {
    if (!selectedProject) return [];
    const dateRangeOverlays = selectedProject.date_ranges.map((range, i) => ({
      key: `range-${i}`,
      label: selectedProject.name,
      start: range.start,
      end: range.end,
    }));
    const phaseOverlays = selectedProject.phases
      .filter((phase) => phase.date_range)
      .map((phase) => ({
        key: `phase-${phase.id}`,
        label: `${selectedProject.name} · ${phase.id}`,
        start: phase.date_range!.start,
        end: phase.date_range!.end,
      }));
    return [...dateRangeOverlays, ...phaseOverlays];
  }, [selectedProject]);

  return (
    <div>
      <h1 style={{ margin: "0 0 1rem" }}>Availability</h1>

      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 1rem" }}>
          <Field label="From">
            <input
              type="date"
              value={start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Overlay project" hint="Highlights the project's period on the timeline">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSquadOnly(false);
              }}
              style={inputStyle}
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && <p style={{ color: colors.danger, margin: "0.5rem 0 0" }}>{error}</p>}
      </Card>

      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 1rem" }}>
          <Field label="Seniority" hint="Only show these levels">
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {SENIORITIES.map((s) => (
                <label
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={seniorityFilter.includes(s)}
                    onChange={() =>
                      setSeniorityFilter((prev) =>
                        prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
                      )
                    }
                  />
                  {s}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Skills" hint="Only show people with at least one of these skills">
            <TagSkillInput
              value={skillFilter}
              onChange={setSkillFilter}
              skillOptions={skillOptions}
            />
            {skillFilter.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.8rem", color: colors.muted }}>Min. level</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={minSkillLevel}
                  onChange={(e) => setMinSkillLevel(parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
            )}
          </Field>
          <Field
            label="Squad membership"
            hint={
              squadFilterAvailable
                ? "Restrict to the selected project's squad members"
                : "Select a project with at least one squad to enable"
            }
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.85rem",
                cursor: squadFilterAvailable ? "pointer" : "not-allowed",
                opacity: squadFilterAvailable ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={squadOnly}
                disabled={!squadFilterAvailable}
                onChange={(e) => setSquadOnly(e.target.checked)}
              />
              Squad members only
            </label>
          </Field>
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: colors.muted }}>
            {start} → {end}
          </span>
          <Legend />
        </div>

        {loading && rows.length === 0 ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: colors.muted }}>
            {people.length === 0 ? "No people found." : "No people match the selected filters."}
          </p>
        ) : (
          <AvailabilityTimeline start={start} end={end} rows={rows} overlays={overlays} />
        )}
      </Card>
    </div>
  );
}

function Legend() {
  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize: "0.75rem",
        color: colors.muted,
      }}
    >
      <span>0%</span>
      <div style={{ display: "flex", width: 100, height: 10, borderRadius: 5, overflow: "hidden" }}>
        {stops.map((ratio) => (
          <div key={ratio} style={{ flex: 1, background: ratioColor(ratio) }} />
        ))}
      </div>
      <span>100% available</span>
    </div>
  );
}
