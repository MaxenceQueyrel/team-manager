import { useEffect, useMemo, useState } from "react";
import {
  AvailabilityTimeline,
  ratioColor,
  type TimelineOverlay,
  type TimelineRow,
} from "@/components/common/AvailabilityTimeline";
import { Card, colors, Field, inputStyle } from "@/components/common/ui";
import { peopleApi } from "@/services/api";
import { useAppStore } from "@/store";
import type { PersonAvailability } from "@/types";

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
  const { people, projects, fetchPeople, fetchProjects } = useAppStore();
  const [{ start, end }, setRange] = useState(defaultRange);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [availability, setAvailability] = useState<PersonAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPeople();
    fetchProjects();
  }, [fetchPeople, fetchProjects]);

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

  const rows: TimelineRow[] = useMemo(() => {
    const byPersonId = new Map(availability.map((a) => [a.person_id, a.segments]));
    return people
      .map((person) => ({
        id: person.id,
        label: person.name,
        segments: byPersonId.get(person.id) ?? [],
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [people, availability]);

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
              onChange={(e) => setSelectedProjectId(e.target.value)}
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
          <p style={{ color: colors.muted }}>No people found.</p>
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
