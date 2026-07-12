import { Fragment } from "react";
import type { AvailabilitySegment } from "@/types";
import { colors } from "@/components/common/ui";

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

function parseISODate(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((parseISODate(endIso) - parseISODate(startIso)) / MS_PER_DAY);
}

/** Left offset and width, as percentages of [rangeStart, rangeEnd], clipped to that window. */
function toPercentSpan(rangeStart: string, rangeEnd: string, spanStart: string, spanEnd: string): { leftPct: number; widthPct: number } | null {
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const clippedStart = spanStart < rangeStart ? rangeStart : spanStart;
  const clippedEnd = spanEnd > rangeEnd ? rangeEnd : spanEnd;
  if (clippedStart > clippedEnd) return null;

  const leftPct = (daysBetween(rangeStart, clippedStart) / totalDays) * 100;
  const widthPct = ((daysBetween(clippedStart, clippedEnd) + 1) / totalDays) * 100;
  return { leftPct, widthPct };
}

/** Red (0%) → green (100%) gradient for an availability ratio. */
export function ratioColor(ratio: number): string {
  const hue = Math.max(0, Math.min(1, ratio)) * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

export function AvailabilityTimeline({
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
  if (start > end) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: "0.4rem", columnGap: "0.75rem", position: "relative" }}>
      <div style={{ gridColumn: 2, gridRow: `1 / span ${Math.max(rows.length, 1)}`, position: "relative" }}>
        {overlays.map((overlay) => {
          const span = toPercentSpan(start, end, overlay.start, overlay.end);
          if (!span) return null;
          return (
            <div
              key={overlay.key}
              title={`${overlay.label}: ${overlay.start} → ${overlay.end}`}
              style={{
                position: "absolute",
                left: `${span.leftPct}%`,
                width: `${span.widthPct}%`,
                top: 0,
                bottom: 0,
                background: "rgba(79, 110, 247, 0.12)",
                borderLeft: `2px solid ${colors.primary}`,
                borderRight: `2px solid ${colors.primary}`,
              }}
            />
          );
        })}
      </div>

      {rows.map((row, i) => (
        <Fragment key={row.id}>
          <div style={{ gridColumn: 1, gridRow: i + 1, display: "flex", alignItems: "center", fontSize: "0.85rem" }}>
            {row.label}
          </div>
          <div
            style={{ gridColumn: 2, gridRow: i + 1, position: "relative", height: 26, background: colors.light, borderRadius: 4 }}
          >
            {row.segments.map((segment, si) => {
              const span = toPercentSpan(start, end, segment.start, segment.end);
              if (!span) return null;
              return (
                <div
                  key={si}
                  title={`${segment.start} → ${segment.end}: ${(segment.ratio * 100).toFixed(0)}%`}
                  style={{
                    position: "absolute",
                    left: `${span.leftPct}%`,
                    width: `${span.widthPct}%`,
                    top: 0,
                    bottom: 0,
                    background: ratioColor(segment.ratio),
                    borderRadius: 3,
                  }}
                />
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
