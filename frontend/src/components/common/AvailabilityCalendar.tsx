import { Fragment, useMemo } from "react";
import { colors } from "@/components/common/ui";
import type { AvailabilitySegment } from "@/types";

export interface TimelineRow {
  id: string;
  label: string;
  segments: AvailabilitySegment[];
}

export interface TimelineOverlay {
  key: string;
  label: string;
  start: string;
  end: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CELL_SIZE = 22;
const LABEL_COLUMN_WIDTH = 180;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.round(
    (parseISODate(endIso).getTime() - parseISODate(startIso).getTime()) / MS_PER_DAY,
  );
}

function enumerateDays(startIso: string, endIso: string): string[] {
  const count = daysBetween(startIso, endIso) + 1;
  const days: string[] = [];
  const cursor = parseISODate(startIso);
  for (let i = 0; i < count; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Assigns each day in `days` the ratio of the segment covering it, relying on segments being sorted and contiguous. */
function dailyRatios(days: string[], segments: AvailabilitySegment[]): (number | null)[] {
  let segmentIndex = 0;
  return days.map((day) => {
    while (segmentIndex < segments.length - 1 && segments[segmentIndex].end < day) {
      segmentIndex++;
    }
    const segment = segments[segmentIndex];
    if (!segment || day < segment.start || day > segment.end) return null;
    return segment.ratio;
  });
}

/** Red (0%) → green (100%) gradient for an availability ratio. */
export function ratioColor(ratio: number): string {
  const hue = Math.max(0, Math.min(1, ratio)) * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

export function AvailabilityCalendar({
  start,
  end,
  rows,
  overlays,
}: {
  start: string;
  end: string;
  rows: TimelineRow[];
  overlays: TimelineOverlay[];
}) {
  const days = useMemo(() => (start <= end ? enumerateDays(start, end) : []), [start, end]);
  const dayIndex = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);

  if (start > end) return null;

  const totalRows = rows.length + 1; // +1 for the header row
  const gridTemplateColumns = `${LABEL_COLUMN_WIDTH}px repeat(${days.length}, ${CELL_SIZE}px)`;

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          position: "relative",
          width: "fit-content",
        }}
      >
        {overlays.map((overlay) => {
          const clippedStart = overlay.start < start ? start : overlay.start;
          const clippedEnd = overlay.end > end ? end : overlay.end;
          const startIdx = dayIndex.get(clippedStart);
          const endIdx = dayIndex.get(clippedEnd);
          if (startIdx === undefined || endIdx === undefined || startIdx > endIdx) return null;
          return (
            <div
              key={overlay.key}
              title={`${overlay.label}: ${overlay.start} → ${overlay.end}`}
              style={{
                gridColumn: `${startIdx + 2} / ${endIdx + 3}`,
                gridRow: `1 / span ${totalRows}`,
                borderLeft: `2px solid ${colors.primary}`,
                borderRight: `2px solid ${colors.primary}`,
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          );
        })}

        <div
          style={{
            gridColumn: 1,
            gridRow: 1,
            position: "sticky",
            left: 0,
            background: "#fff",
            zIndex: 2,
          }}
        />
        {days.map((day, i) => {
          const date = parseISODate(day);
          const isFirstOfMonth = date.getUTCDate() === 1 || i === 0;
          const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
          return (
            <div
              key={day}
              title={day}
              style={{
                gridColumn: i + 2,
                gridRow: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                fontSize: "0.65rem",
                color: colors.muted,
                background: isWeekend ? colors.light : "transparent",
                paddingBottom: 2,
              }}
            >
              <span
                style={{ fontSize: "0.6rem", visibility: isFirstOfMonth ? "visible" : "hidden" }}
              >
                {MONTH_NAMES[date.getUTCMonth()]}
              </span>
              <span>{date.getUTCDate()}</span>
            </div>
          );
        })}

        {rows.map((row, rowIdx) => {
          const ratios = dailyRatios(days, row.segments);
          return (
            <Fragment key={row.id}>
              <div
                style={{
                  gridColumn: 1,
                  gridRow: rowIdx + 2,
                  position: "sticky",
                  left: 0,
                  background: "#fff",
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "0.85rem",
                  paddingRight: "0.5rem",
                }}
              >
                {row.label}
              </div>
              {days.map((day, i) => {
                const ratio = ratios[i];
                const date = parseISODate(day);
                const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                return (
                  <div
                    key={day}
                    title={
                      ratio === null ? `${day}: no data` : `${day}: ${(ratio * 100).toFixed(0)}%`
                    }
                    style={{
                      gridColumn: i + 2,
                      gridRow: rowIdx + 2,
                      margin: 2,
                      borderRadius: 3,
                      background:
                        ratio === null
                          ? isWeekend
                            ? colors.light
                            : colors.border
                          : ratioColor(ratio),
                    }}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
