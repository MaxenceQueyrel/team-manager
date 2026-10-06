import { Badge, colors } from "@/components/common/ui";
import {
  assignedCount,
  fillColors,
  fillStatus,
  type StaffingLane,
} from "@/components/projects/staffing";

const DAY_MS = 86_400_000;

function toDay(iso: string): number {
  return Date.parse(iso) / DAY_MS;
}

function monthTicks(firstDay: number, lastDay: number): { day: number; label: string }[] {
  const ticks: { day: number; label: string }[] = [];
  const cursor = new Date(firstDay * DAY_MS);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() / DAY_MS < lastDay) {
    ticks.push({
      day: cursor.getTime() / DAY_MS,
      label: cursor.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  // Keep at most ~12 labels so long projects stay legible.
  const step = Math.ceil(ticks.length / 12);
  return ticks.filter((_, i) => i % step === 0);
}

/** Phases as bars on a shared date axis, so sequential and overlapping phases read at a glance. */
export function PhaseTimeline({ lanes }: { lanes: StaffingLane[] }) {
  const staffable = lanes.filter((lane) => lane.nSlots !== null);
  const bars = staffable.flatMap((lane) =>
    lane.dateRanges.map((range, i) => ({ lane, range, key: `${lane.key}-${i}` })),
  );
  const undated = staffable.filter((lane) => lane.dateRanges.length === 0);

  const starts = bars.map((b) => b.range.start).sort();
  const ends = bars.map((b) => b.range.end).sort();
  const firstDate = starts[0];
  const lastDate = ends[ends.length - 1];
  const firstDay = toDay(firstDate);
  // End dates are inclusive, so the axis runs to the day after the last one.
  const lastDay = toDay(lastDate) + 1;
  const percentOfSpan = (days: number) => `${(days / (lastDay - firstDay)) * 100}%`;

  return (
    <div>
      {bars.length > 0 && (
        <div style={{ position: "relative", paddingTop: "1.25rem" }}>
          {monthTicks(firstDay, lastDay).map((tick) => (
            <div
              key={tick.day}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: percentOfSpan(tick.day - firstDay),
                borderLeft: `1px dashed ${colors.border}`,
                fontSize: "0.7rem",
                color: colors.muted,
                paddingLeft: 3,
                whiteSpace: "nowrap",
              }}
            >
              {tick.label}
            </div>
          ))}
          {bars.map(({ lane, range, key }) => {
            const status = fillStatus(lane);
            return (
              <div key={key} style={{ position: "relative", height: 30, marginBottom: 6 }}>
                <div
                  title={`${lane.label}: ${range.start} → ${range.end}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: percentOfSpan(toDay(range.start) - firstDay),
                    width: percentOfSpan(toDay(range.end) + 1 - toDay(range.start)),
                    minWidth: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0 0.5rem",
                    background: colors.primaryBg,
                    border: `1px solid ${colors.primary}`,
                    borderRadius: 6,
                    fontSize: "0.8rem",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  <strong>{lane.label}</strong>
                  <Badge color={fillColors[status]}>
                    {assignedCount(lane)} / {lane.nSlots}
                  </Badge>
                </div>
              </div>
            );
          })}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: colors.muted,
            }}
          >
            <span>{firstDate}</span>
            <span>{lastDate}</span>
          </div>
        </div>
      )}
      {undated.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: bars.length > 0 ? "0.75rem" : 0,
            fontSize: "0.8rem",
          }}
        >
          <span style={{ color: colors.muted }}>Undated:</span>
          {undated.map((lane) => (
            <span key={lane.key} style={{ display: "inline-flex", gap: "0.3rem" }}>
              <strong>{lane.label}</strong>
              <Badge color={fillColors[fillStatus(lane)]}>
                {assignedCount(lane)} / {lane.nSlots}
              </Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
