import { daysBetween } from "@/components/common/AvailabilityCalendar";

export const MONTHS = [
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

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  // getUTCDay() counts from Sunday; weeks start on Monday.
  return addDays(iso, -((parseISODate(iso).getUTCDay() + 6) % 7));
}

/** "30 Sep", or "30 Sep 2026" with `withYear`. */
export function formatDay(iso: string, withYear = false): string {
  const date = parseISODate(iso);
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
  return withYear ? `${day} ${date.getUTCFullYear()}` : day;
}

/** "1 Jul → 30 Sep 2026"; the start keeps its year when the span crosses a year. */
export function formatSpan(start: string, end: string): string {
  return `${formatDay(start, start.slice(0, 4) !== end.slice(0, 4))} → ${formatDay(end, true)}`;
}

/** Length of an inclusive span: "10 days" under two weeks, "13 weeks" otherwise. */
export function formatDuration(start: string, end: string): string {
  const days = daysBetween(start, end) + 1;
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
