import { colors } from "@/components/common/ui";
import type {
  AssignedMember,
  Assignment,
  DateRange,
  Person,
  Project,
  SkillRequirement,
} from "@/types";

export type FillStatus = "complete" | "partial" | "empty";

export const fillColors: Record<FillStatus, string> = {
  complete: colors.success,
  partial: "#fd7e14",
  empty: colors.danger,
};

/** One staffing unit of a project: a phase, the whole (non-phased) project, or the
 * catch-all for assignments that belong to no current phase. */
export interface StaffingLane {
  key: string;
  label: string;
  phaseId: string | null; // sent as `phase_id` when assigning from this lane
  nSlots: number | null; // null for the unphased lane, which has no requirements
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

export function fillStatus(lane: StaffingLane): FillStatus {
  const assigned = assignedCount(lane);
  if (assigned === 0) return "empty";
  return assigned >= (lane.nSlots ?? 0) ? "complete" : "partial";
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

/** Slots filled across all lanes; over-staffing one lane never offsets a gap in another. */
export function staffedSlots(lanes: StaffingLane[]): { staffed: number; total: number } {
  let staffed = 0;
  let total = 0;
  for (const lane of lanes) {
    if (lane.nSlots === null) continue;
    staffed += Math.min(assignedCount(lane), lane.nSlots);
    total += lane.nSlots;
  }
  return { staffed, total };
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
