import { useMemo, useState } from "react";
import { daysBetween, enumerateDays, ratioColor } from "@/components/common/AvailabilityCalendar";
import { Button, colors, inputStyle } from "@/components/common/ui";
import type { DateRange } from "@/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CELL_SIZE = 34;

function vacationDays(ranges: DateRange[]): Set<string> {
  return new Set(ranges.flatMap((r) => enumerateDays(r.start, r.end)));
}

function toRanges(days: Set<string>): DateRange[] {
  const ranges: DateRange[] = [];
  for (const day of [...days].sort()) {
    const last = ranges[ranges.length - 1];
    if (last && daysBetween(last.end, day) === 1) last.end = day;
    else ranges.push({ start: day, end: day });
  }
  return ranges;
}

function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function monthDays(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return enumerateDays(`${month}-01`, last);
}

function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Month calendar for marking whole days off; edits are stored as merged inclusive date ranges. */
export function VacationPicker({
  value,
  onChange,
}: {
  value: DateRange[];
  onChange: (v: DateRange[]) => void;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null);
  const selected = useMemo(() => vacationDays(value), [value]);
  const days = monthDays(month);
  // getUTCDay() counts from Sunday; the grid starts on Monday.
  const firstWeekday = (new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;

  const toggle = (day: string, extendRange: boolean) => {
    const markOff = !selected.has(day);
    const span =
      extendRange && anchor
        ? enumerateDays(anchor < day ? anchor : day, anchor < day ? day : anchor)
        : [day];
    const next = new Set(selected);
    for (const d of span) {
      if (markOff) next.add(d);
      else next.delete(d);
    }
    setAnchor(day);
    onChange(toRanges(next));
  };

  const remove = (range: DateRange) => {
    const next = new Set(selected);
    for (const d of enumerateDays(range.start, range.end)) next.delete(d);
    onChange(toRanges(next));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <Button ariaLabel="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ←
        </Button>
        <input
          type="month"
          aria-label="Vacation month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          style={{ ...inputStyle, width: 180 }}
        />
        <Button ariaLabel="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          →
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(7, ${CELL_SIZE}px)`,
          gap: 4,
          marginBottom: "0.75rem",
        }}
      >
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            style={{ fontSize: "0.7rem", color: colors.muted, textAlign: "center" }}
          >
            {weekday}
          </div>
        ))}
        {days.map((day, i) => {
          const off = selected.has(day);
          return (
            <button
              key={day}
              type="button"
              aria-label={day}
              aria-pressed={off}
              title={off ? `${day}: vacation` : day}
              onClick={(e) => toggle(day, e.shiftKey)}
              style={{
                gridColumnStart: i === 0 ? firstWeekday + 1 : undefined,
                height: CELL_SIZE,
                borderRadius: 6,
                fontSize: "0.8rem",
                cursor: "pointer",
                border: `1px solid ${off ? ratioColor(0) : colors.borderStrong}`,
                background: off ? ratioColor(0) : isWeekend(day) ? colors.light : "#fff",
                color: off ? "#fff" : colors.text,
                fontWeight: anchor === day ? 700 : 400,
              }}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      {value.length === 0 ? (
        <p style={{ color: colors.muted, margin: 0, fontSize: "0.85rem" }}>No vacation booked.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.85rem" }}>
          {value.map((range) => (
            <li
              key={`${range.start}-${range.end}`}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: 4 }}
            >
              <span style={{ flex: 1 }}>
                {range.start} → {range.end} ({daysBetween(range.start, range.end) + 1} days)
              </span>
              <Button
                variant="ghost"
                ariaLabel={`Remove vacation ${range.start} → ${range.end}`}
                onClick={() => remove(range)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
