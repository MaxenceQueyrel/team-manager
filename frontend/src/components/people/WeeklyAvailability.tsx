import { useEffect, useId, useState } from "react";
import {
  addDays,
  daysBetween,
  enumerateDays,
  isoToday,
  MONTH_NAMES,
  mondayOf,
} from "@/components/common/dates";
import { Card, colors, Field, fonts, inputStyle, Tabs } from "@/components/common/ui";
import { errorMessage, peopleApi } from "@/services/api";
import type { AvailabilitySegment, Person } from "@/types";

type RangeChoice = "1m" | "3m" | "6m" | "custom";
export type WeekStatus = "free" | "partly" | "booked";

const PRESET_WEEKS: Record<Exclude<RangeChoice, "custom">, number> = {
  "1m": 5,
  "3m": 13,
  "6m": 26,
};

// Keeps a half-typed year (e.g. 0002) from rendering thousands of weeks.
const MAX_WEEKS = 104;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const RANGE_TABS = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "custom", label: "Custom" },
];

const PARTLY_COLOR = `color-mix(in srgb, ${colors.success} 45%, ${colors.surface})`;

export const STATUS_STYLES: Record<WeekStatus, { label: string; color: string }> = {
  free: { label: "Free", color: colors.success },
  partly: { label: "Partly booked", color: PARTLY_COLOR },
  booked: { label: "Booked", color: colors.track },
};

interface Week {
  start: string;
  status: WeekStatus;
  free: number; // share of the contracted capacity left, 0–1
}

export function summarizeWeek(
  start: string,
  segments: AvailabilitySegment[],
  capacity: number,
): Week {
  const ratios = enumerateDays(start, addDays(start, 6)).map(
    (day) => segments.find((s) => s.start <= day && day <= s.end)?.ratio ?? 0,
  );
  const average = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  let status: WeekStatus = "partly";
  if (ratios.every((r) => r >= capacity)) status = "free";
  else if (ratios.every((r) => r === 0)) status = "booked";
  return { start, status, free: Math.min(average / capacity, 1) };
}

function pluralWeeks(count: number): string {
  return `${count} ${count === 1 ? "week" : "weeks"}`;
}

function summarySentence(weeks: Week[]): string {
  const booked = weeks.filter((w) => w.status === "booked").length;
  const partly = weeks.filter((w) => w.status === "partly").length;
  const total = pluralWeeks(weeks.length);
  if (booked === 0 && partly === 0) {
    return `Fully free for all ${total}: no assignments or time off`;
  }
  if (booked > 0 && partly > 0) return `Booked ${booked} and partly booked ${partly} of ${total}`;
  if (booked > 0) return `Booked ${booked} of ${total}`;
  return `Partly booked ${partly} of ${total}`;
}

/** Month name above the first week of each month; abbreviated when the next label is close. */
function monthLabels(weeks: Week[]): (string | null)[] {
  const starts = weeks.map(
    (w, i) => i === 0 || w.start.slice(0, 7) !== weeks[i - 1].start.slice(0, 7),
  );
  return weeks.map((week, i) => {
    if (!starts[i]) return null;
    const next = starts.indexOf(true, i + 1);
    const span = (next === -1 ? weeks.length : next) - i;
    const name = MONTH_NAMES[Number(week.start.slice(5, 7)) - 1];
    return span < 3 ? name.slice(0, 3) : name;
  });
}

/** Whole weeks covering the preset or custom range; null when the custom dates are unusable. */
function visibleRange(
  choice: RangeChoice,
  custom: { from: string; to: string },
  thisWeek: string,
): { start: string; end: string } | null {
  if (choice !== "custom") {
    return { start: thisWeek, end: addDays(thisWeek, PRESET_WEEKS[choice] * 7 - 1) };
  }
  if (!ISO_DATE.test(custom.from) || !ISO_DATE.test(custom.to) || custom.from > custom.to) {
    return null;
  }
  const start = mondayOf(custom.from);
  const end = addDays(mondayOf(custom.to), 6);
  return daysBetween(start, end) < MAX_WEEKS * 7 ? { start, end } : null;
}

/** The person's availability as one cell per week (Monday to Sunday) over a chosen range. */
export function WeeklyAvailability({ person }: { person: Person }) {
  const headingId = useId();
  const [choice, setChoice] = useState<RangeChoice>("3m");
  const [custom, setCustom] = useState(() => ({ from: isoToday(), to: addDays(isoToday(), 90) }));
  const [segments, setSegments] = useState<AvailabilitySegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thisWeek = mondayOf(isoToday());
  const range = visibleRange(choice, custom, thisWeek);
  const start = range?.start ?? "";
  const end = range?.end ?? "";

  // Depends on `person` so the strip refreshes after time off or assignments change.
  useEffect(() => {
    if (!start) return;
    let stale = false;
    setSegments(null);
    setError(null);
    peopleApi
      .availability(start, end)
      .then((all) => {
        if (!stale) setSegments(all.find((a) => a.person_id === person.id)?.segments ?? []);
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      stale = true;
    };
  }, [person, start, end]);

  const weekStarts = start ? enumerateDays(start, end).filter((_, i) => i % 7 === 0) : [];
  const weeks = segments
    ? weekStarts.map((w) => summarizeWeek(w, segments, person.base_capacity))
    : [];
  const labels = monthLabels(weeks);

  return (
    <section aria-labelledby={headingId}>
      <Card style={{ padding: "1.4rem 1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1.1rem",
          }}
        >
          <h2 id={headingId} style={{ margin: 0 }}>
            Availability
          </h2>
          <Tabs
            variant="segmented"
            ariaLabel="Availability range"
            items={RANGE_TABS}
            value={choice}
            onChange={(value) => {
              if (value === "custom") setCustom({ from: start, to: end });
              setChoice(value as RangeChoice);
            }}
          />
        </div>

        {choice === "custom" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
            <Field label="From">
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                style={inputStyle}
              />
            </Field>
          </div>
        )}

        {!range ? (
          <p style={{ color: colors.danger, margin: 0 }}>
            Pick a start date on or before the end date, at most two years apart.
          </p>
        ) : error ? (
          <p style={{ color: colors.danger, margin: 0 }}>{error}</p>
        ) : !segments ? (
          <p style={{ color: colors.muted, margin: 0 }}>Loading…</p>
        ) : (
          <>
            <div style={{ overflowX: "auto", paddingBottom: 2 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${weeks.length}, minmax(24px, 1fr))`,
                  columnGap: 6,
                  rowGap: 6,
                  minWidth: weeks.length * 30,
                }}
              >
                {weeks.map((week, i) => (
                  <div
                    key={`month-${week.start}`}
                    style={{
                      gridRow: 1,
                      gridColumn: i + 1,
                      fontSize: "0.82rem",
                      color: colors.muted,
                      whiteSpace: "nowrap",
                      minHeight: "1.2em",
                    }}
                  >
                    {labels[i]}
                  </div>
                ))}
                {weeks.map((week, i) => {
                  const { label, color } = STATUS_STYLES[week.status];
                  const title =
                    week.status === "partly"
                      ? `Week of ${week.start}: ${label.toLowerCase()}, ${Math.round(week.free * 100)}% free`
                      : `Week of ${week.start}: ${label.toLowerCase()}`;
                  return (
                    <div
                      key={week.start}
                      role="img"
                      aria-label={title}
                      title={title}
                      style={{
                        gridRow: 2,
                        gridColumn: i + 1,
                        height: 38,
                        borderRadius: "var(--radius-sm)",
                        background: color,
                        border: `2px solid ${week.start === thisWeek ? colors.text : "transparent"}`,
                      }}
                    />
                  );
                })}
                {weeks.map((week, i) => (
                  <div
                    key={`day-${week.start}`}
                    aria-hidden
                    style={{
                      gridRow: 3,
                      gridColumn: i + 1,
                      fontFamily: fonts.mono,
                      fontSize: "0.75rem",
                      color: colors.muted,
                    }}
                  >
                    {Number(week.start.slice(8))}
                  </div>
                ))}
              </div>
            </div>
            <p
              style={{
                margin: "1rem 0 0.75rem",
                fontWeight: 500,
                color: weeks.every((w) => w.status === "free") ? colors.success : colors.text,
              }}
            >
              {summarySentence(weeks)}
            </p>
            <Legend />
          </>
        )}
      </Card>
    </section>
  );
}

function Legend() {
  const swatch = (background: string, border = "transparent") => (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: 3,
        background,
        border: `2px solid ${border}`,
        display: "inline-block",
      }}
    />
  );
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.4rem 1.1rem",
        fontSize: "0.82rem",
        color: colors.muted,
      }}
    >
      {(["free", "partly", "booked"] as const).map((status) => (
        <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {swatch(STATUS_STYLES[status].color)}
          {STATUS_STYLES[status].label}
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {swatch(colors.surface, colors.text)}
        This week
      </span>
    </div>
  );
}
