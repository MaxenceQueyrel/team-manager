import { formatDay, formatDuration, MONTHS } from "@/components/common/dates";
import { colors } from "@/components/common/ui";
import { assignedFte, type StaffingLane } from "@/components/projects/staffing";

const DAY_MS = 86_400_000;
const MAX_TICKS = 6;

function toDay(iso: string): number {
  return Date.parse(iso) / DAY_MS;
}

function monthTicks(firstDay: number, lastDay: number): { day: number; label: string }[] {
  const ticks: { day: number; label: string }[] = [];
  const cursor = new Date(firstDay * DAY_MS);
  cursor.setUTCDate(1);
  if (cursor.getTime() / DAY_MS < firstDay) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  const crossesYears =
    new Date(firstDay * DAY_MS).getUTCFullYear() !== new Date(lastDay * DAY_MS).getUTCFullYear();
  while (cursor.getTime() / DAY_MS < lastDay) {
    const month = MONTHS[cursor.getUTCMonth()];
    ticks.push({
      day: cursor.getTime() / DAY_MS,
      label: crossesYears ? `${month} ${String(cursor.getUTCFullYear()).slice(2)}` : month,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  // The sidebar is narrow: keep a handful of labels so long projects stay legible.
  const step = Math.ceil(ticks.length / MAX_TICKS);
  return ticks.filter((_, i) => i % step === 0);
}

/** Date ranges and phases as bars on a month axis with a today marker, followed by the
 * project's first and last dates, its duration and its phase count. */
export function PhaseTimeline({ lanes, today }: { lanes: StaffingLane[]; today: string }) {
  const staffable = lanes.filter((lane) => lane.nSlots !== null);
  const phased = staffable.some((lane) => lane.phaseId !== null);
  const dated = staffable.filter((lane) => lane.dateRanges.length > 0);
  const undated = staffable.filter((lane) => lane.dateRanges.length === 0);
  const ranges = dated.flatMap((lane) => lane.dateRanges);

  const phasesLabel = phased
    ? `${staffable.length} ${staffable.length === 1 ? "phase" : "phases"}`
    : "One phase, whole project";

  if (ranges.length === 0) {
    return (
      <div>
        <p style={{ margin: 0, color: colors.muted, fontSize: "0.9rem" }}>No dates set yet.</p>
        <TimelineFacts facts={[["Phases", phasesLabel]]} />
      </div>
    );
  }

  const starts = ranges.map((r) => r.start).sort();
  const ends = ranges.map((r) => r.end).sort();
  const firstDate = starts[0];
  const lastDate = ends[ends.length - 1];
  // End dates are inclusive, so the project runs to the day after the last one.
  const startDay = toDay(firstDate);
  const endDay = toDay(lastDate) + 1;
  const todayDay = toDay(today);
  // Stretch the axis to show today when it is close; a far-off today would squash the bars.
  const slack = (endDay - startDay) / 2;
  const showToday = todayDay >= startDay - slack && todayDay <= endDay + slack;
  const firstDay = showToday ? Math.min(startDay, todayDay) : startDay;
  const lastDay = showToday ? Math.max(endDay, todayDay + 1) : endDay;
  const percentOf = (days: number) => `${(days / (lastDay - firstDay)) * 100}%`;
  const barHeight = 28;

  return (
    <div>
      <div style={{ position: "relative", fontSize: "0.8rem", color: colors.muted, height: 18 }}>
        {monthTicks(firstDay, lastDay).map((tick) => (
          <span
            key={tick.day}
            style={{
              position: "absolute",
              left: percentOf(tick.day - firstDay),
              whiteSpace: "nowrap",
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", marginTop: "0.4rem" }}>
        {dated.map((lane) => {
          const fte = assignedFte(lane);
          return (
            <div
              key={lane.key}
              title={lane.dateRanges.map((r) => `${lane.label}: ${r.start} → ${r.end}`).join(", ")}
              style={{ marginBottom: "0.5rem" }}
            >
              {phased && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.2rem",
                    fontSize: "0.82rem",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{lane.label}</span>
                  <span
                    className="mono"
                    style={{
                      color: fte >= (lane.nSlots ?? 0) ? colors.success : colors.warningText,
                    }}
                  >
                    {fte} / {lane.nSlots} FTE
                  </span>
                </div>
              )}
              <div
                style={{
                  position: "relative",
                  height: barHeight,
                  borderRadius: "var(--radius-sm)",
                  background: colors.track,
                  overflow: "hidden",
                }}
              >
                {lane.dateRanges.map((range) => (
                  <div
                    key={`${range.start}-${range.end}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: percentOf(toDay(range.start) - firstDay),
                      width: percentOf(toDay(range.end) + 1 - toDay(range.start)),
                      minWidth: 4,
                      background: colors.primaryBg,
                      border: `1px solid ${colors.primarySoft}`,
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {showToday && (
          <div
            aria-hidden
            title={`Today, ${formatDay(today, true)}`}
            style={{
              position: "absolute",
              top: -4,
              bottom: 4,
              left: percentOf(todayDay - firstDay),
              width: 2,
              background: colors.text,
              borderRadius: 1,
            }}
          />
        )}
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.5rem",
          fontSize: "0.8rem",
          color: colors.muted,
        }}
      >
        <span>{formatDay(firstDate, true)}</span>
        <span>{formatDay(lastDate, true)}</span>
      </div>
      <TimelineFacts
        facts={[
          ["Duration", formatDuration(firstDate, lastDate)],
          ["Phases", phasesLabel],
          ...(undated.length > 0
            ? [
                [
                  "Undated",
                  undated
                    .map((lane) => `${lane.label} (${assignedFte(lane)} / ${lane.nSlots} FTE)`)
                    .join(", "),
                ] as [string, string],
              ]
            : []),
        ]}
      />
    </div>
  );
}

function TimelineFacts({ facts }: { facts: [string, string][] }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0.4rem 1rem",
        margin: "1rem 0 0",
        fontSize: "0.9rem",
      }}
    >
      {facts.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <dt style={{ color: colors.muted }}>{label}</dt>
          <dd style={{ margin: 0 }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
