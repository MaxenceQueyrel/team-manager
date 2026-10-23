import type { FillTone, PillTone } from "@/components/common/ui";
import type {
  AssignedMember,
  Assignment,
  DateRange,
  Person,
  Project,
  SkillRequirement,
} from "@/types";

export type FillStatus = "complete" | "partial" | "empty";

/** Pill / fill-bar tone per fill status; an empty lane reads as a gap like a partial one. */
export const fillTones: Record<FillStatus, FillTone> = {
  complete: "success",
  partial: "warning",
  empty: "warning",
};

/** One staffing unit of a project: a phase, the whole (non-phased) project, or the
 * catch-all for assignments that belong to no current phase. */
export interface StaffingLane {
  key: string;
  label: string;
  phaseId: string | null; // sent as `phase_id` when assigning from this lane
  nSlots: number | null; // FTE needed; null for the unphased lane, which has no requirements
  skillRequirements: SkillRequirement[];
  dateRanges: DateRange[];
  assignments: Assignment[];
}

/** Splits a project's assignments into staffing lanes, phases in timeline order (undated last). */
export function buildLanes(project: Project, assignments: Assignment[]): StaffingLane[] {
  const own = assignments.filter((a) => a.project_id === project.id);
  if (project.phases.length === 0) {
    return [
      {
        key: "whole-project",
        label: "Whole project",
        phaseId: null,
        nSlots: project.n_slots,
        skillRequirements: project.skill_requirements,
        dateRanges: project.date_ranges,
        assignments: own,
      },
    ];
  }

  const phases = [...project.phases].sort((a, b) => {
    if (!a.date_range || !b.date_range) return Number(!a.date_range) - Number(!b.date_range);
    return a.date_range.start.localeCompare(b.date_range.start);
  });
  const lanes: StaffingLane[] = phases.map((phase) => ({
    key: `phase-${phase.id}`,
    label: phase.id,
    phaseId: phase.id,
    nSlots: phase.n_slots,
    skillRequirements: phase.skill_requirements,
    dateRanges: phase.date_range ? [phase.date_range] : [],
    assignments: own.filter((a) => a.phase_id === phase.id),
  }));

  // Phases can be renamed or removed after people were staffed on them; those
  // assignments land here too so nothing on the project is hidden.
  const phaseIds = new Set(project.phases.map((p) => p.id));
  const unphased = own.filter((a) => a.phase_id === null || !phaseIds.has(a.phase_id));
  if (unphased.length > 0) {
    lanes.push({
      key: "unphased",
      label: "Unphased",
      phaseId: null,
      nSlots: null,
      skillRequirements: [],
      dateRanges: [],
      assignments: unphased,
    });
  }
  return lanes;
}

export function assignedCount(lane: StaffingLane): number {
  return new Set(lane.assignments.map((a) => a.person_id)).size;
}

function roundFte(fte: number): number {
  return Math.round(fte * 100) / 100;
}

/** Each distinct person's FTE on the lane, in roster order: their highest ratio on it. */
export function fteByPerson(lane: StaffingLane): Map<string, number> {
  // A project with several date ranges holds one assignment per range for the same person.
  const ratioByPerson = new Map<string, number>();
  for (const a of lane.assignments) {
    ratioByPerson.set(a.person_id, Math.max(ratioByPerson.get(a.person_id) ?? 0, a.ratio));
  }
  return ratioByPerson;
}

/** FTE staffed on the lane: each distinct person counts once, at their ratio on the lane. */
export function assignedFte(lane: StaffingLane): number {
  let total = 0;
  for (const ratio of fteByPerson(lane).values()) total += ratio;
  return roundFte(total);
}

export function formatFte(fte: number): string {
  return String(roundFte(fte));
}

export function formatHeadcount(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

export function fillStatus(lane: StaffingLane): FillStatus {
  const fte = assignedFte(lane);
  if (fte === 0) return "empty";
  return fte >= (lane.nSlots ?? 0) ? "complete" : "partial";
}

/** Requirements of the lane that no assigned person meets at the required level. */
export function missingSkills(lane: StaffingLane, people: Person[]): SkillRequirement[] {
  const assignedIds = new Set(lane.assignments.map((a) => a.person_id));
  const assigned = people.filter((p) => assignedIds.has(p.id));
  return lane.skillRequirements.filter(
    (req) =>
      !assigned.some((p) => p.skills.some((s) => s.id === req.id && s.level >= req.min_level)),
  );
}

/** FTE staffed across all lanes; over-staffing one lane never offsets a gap in another. */
export function staffedFte(lanes: StaffingLane[]): { staffed: number; total: number } {
  let staffed = 0;
  let total = 0;
  for (const lane of lanes) {
    if (lane.nSlots === null) continue;
    staffed += Math.min(assignedFte(lane), lane.nSlots);
    total += lane.nSlots;
  }
  return { staffed: roundFte(staffed), total };
}

/** Current staffing as team members, limited to the phases `proposed` covers: applying a
 * proposal only replaces those, so other phases are not part of its diff. */
export function staffingBaseline(
  assignments: Assignment[],
  proposed: AssignedMember[],
): AssignedMember[] {
  const covered = new Set(proposed.map((m) => m.phase_id));
  const byKey = new Map<string, AssignedMember>();
  for (const a of assignments) {
    if (!covered.has(a.phase_id)) continue;
    // A project with several date ranges holds one assignment per range for the same member.
    byKey.set(`${a.person_id}|${a.phase_id}`, {
      person_id: a.person_id,
      fte_allocation: a.ratio,
      phase_id: a.phase_id,
    });
  }
  return [...byKey.values()];
}

/** Whether every lane with requirements has its FTE filled and all its skills covered. */
export function isFullyStaffed(lanes: StaffingLane[], people: Person[]): boolean {
  return lanes.every(
    (lane) =>
      lane.nSlots === null ||
      (fillStatus(lane) === "complete" && missingSkills(lane, people).length === 0),
  );
}

/** Lifecycle status shown as a pill on project lists and the project workspace. */
export type ProjectStatus = "unstaffed" | "running" | "ended" | "complete";

export const projectStatusLabels: Record<ProjectStatus, string> = {
  unstaffed: "Unstaffed",
  running: "Running",
  ended: "Ended",
  complete: "Complete",
};

export const projectStatusTones: Record<ProjectStatus, PillTone> = {
  unstaffed: "warning",
  running: "success",
  ended: "neutral",
  complete: "primary",
};

/** Today as a local `YYYY-MM-DD` date, comparable with the ISO dates on projects. */
export function isoToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** First start to last end across the project's date ranges and phase dates; null if undated. */
export function projectSpan(project: Project): DateRange | null {
  const ranges = [
    ...project.date_ranges,
    ...project.phases.flatMap((phase) => (phase.date_range ? [phase.date_range] : [])),
  ];
  if (ranges.length === 0) return null;
  let { start, end } = ranges[0];
  for (const range of ranges) {
    if (range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  }
  return { start, end };
}

/** Status of a project on `today` (`YYYY-MM-DD`), first match wins: `complete` once
 * `completed_at` is set, `ended` when its last date is past, `unstaffed` when nobody is
 * assigned, otherwise `running` (which includes staffed projects that have not started). */
export function projectStatus(
  project: Project,
  lanes: StaffingLane[],
  today: string,
): ProjectStatus {
  if (project.completed_at) return "complete";
  const span = projectSpan(project);
  if (span && span.end < today) return "ended";
  return lanes.some((lane) => lane.assignments.length > 0) ? "running" : "unstaffed";
}

/** Whether a project that is not complete still has requested FTE left to fill, even if it ended. */
export function needsStaffing(project: Project, lanes: StaffingLane[]): boolean {
  if (project.completed_at) return false;
  const { staffed, total } = staffedFte(lanes);
  return staffed < total;
}

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

/** "1 Jul", or "1 Jul 2026" with `withYear`, from a `YYYY-MM-DD` date. */
export function formatDay(iso: string, withYear: boolean): string {
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
