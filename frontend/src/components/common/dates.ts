import type { DateRange } from "@/types";

const MS_PER_DAY = 86_400_000;

// Spelled out rather than via toLocaleDateString, whose en-GB short month for September
// ("Sept") varies across ICU versions.
export const MONTHS = [
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

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A `YYYY-MM-DD` date as UTC midnight, so day arithmetic never crosses a DST change. */
export function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Today as a local `YYYY-MM-DD` date, comparable with the ISO dates on projects. */
export function isoToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function daysBetween(startIso: string, endIso: string): number {
  return Math.round(
    (parseISODate(endIso).getTime() - parseISODate(startIso).getTime()) / MS_PER_DAY,
  );
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function enumerateDays(startIso: string, endIso: string): string[] {
  const count = daysBetween(startIso, endIso) + 1;
  const days: string[] = [];
  for (let i = 0; i < count; i++) days.push(addDays(startIso, i));
  return days;
}

export function mondayOf(iso: string): string {
  // getUTCDay() counts from Sunday; weeks start on Monday.
  return addDays(iso, -((parseISODate(iso).getUTCDay() + 6) % 7));
}

/** "1 Jul", or "1 Jul 2026" with `withYear`, from a `YYYY-MM-DD` date. */
export function formatDay(iso: string, withYear = false): string {
  const [year, month, day] = iso.split("-");
  const dayMonth = `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  return withYear ? `${dayMonth} ${year}` : dayMonth;
}

/** "1 Jul → 30 Sep"; years are shown only when the span leaves the year of `today`. */
export function formatSpan(span: DateRange, today: string): string {
  const year = today.slice(0, 4);
  const withYear = !span.start.startsWith(year) || !span.end.startsWith(year);
  return `${formatDay(span.start, withYear)} → ${formatDay(span.end, withYear)}`;
}

/** Length of an inclusive span: "10 days" under two weeks, "13 weeks" otherwise. */
export function formatDuration(start: string, end: string): string {
  const days = daysBetween(start, end) + 1;
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
