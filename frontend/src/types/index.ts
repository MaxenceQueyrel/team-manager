export type Seniority = "junior" | "mid" | "senior" | "lead";
export type Priority = "low" | "medium" | "high" | "critical";

export interface Role {
  id: string;
  description?: string;
}

export interface SkillLevel {
  id: string;
  description?: string;
  level: number; // 0–5 proficiency
}

export interface SkillRequirement {
  id: string;
  description?: string;
  min_level: number; // 0–5 minimum proficiency
}

export interface DateRange {
  start: string; // ISO date (YYYY-MM-DD)
  end: string;
}

export interface AvailabilityWindow extends DateRange {
  ratio: number; // 0–1 fraction of FTE during the window
}

export interface AvailabilitySegment extends DateRange {
  ratio: number; // 0–1 fraction of FTE available during the segment
}

export interface PersonAvailability {
  person_id: string;
  segments: AvailabilitySegment[];
}

export interface Person {
  id: string;
  name: string;
  role: string;
  seniority: Seniority;
  years_of_experience: number;
  working_days_per_week: number; // 1–7
  skills: SkillLevel[];
  vacations: DateRange[]; // inclusive days off
  availability_windows: AvailabilityWindow[];
  preferences: string[]; // skill ids the person prefers
  growth_targets: string[]; // skill ids the person wants to grow in
  affinities: Record<string, number>; // person_id → score (-5..+5)
  base_capacity: number; // read-only, derived from working_days_per_week
}

export type PersonInput = Omit<Person, "id" | "base_capacity">;

export interface PeopleImportSummary {
  created: string[]; // ids of people created by the import
  skipped: string[]; // ids that already existed and were left untouched
  created_roles: string[]; // role ids auto-created because the CSV referenced them
  created_skills: string[]; // skill ids auto-created because the CSV referenced them
}

export interface ProjectsImportSummary {
  created: string[]; // ids of projects created by the import
  skipped: string[]; // ids that already existed and were left untouched
}

export interface Squad {
  member_ids: string[];
}

export interface ProjectPhase {
  id: string;
  n_slots: number;
  skill_requirements: SkillRequirement[];
  date_range: DateRange | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  n_slots: number;
  skill_requirements: SkillRequirement[];
  excluded_person_ids: string[];
  included_person_ids: string[];
  squads: Squad[];
  date_ranges: DateRange[];
  phases: ProjectPhase[];
  // Earliest and latest allowed start; the optimizer shifts the whole schedule within it.
  start_window: DateRange | null;
  priority: Priority;
  completed_at: string | null; // ISO date the project was marked complete
}

export interface Assignment {
  id: string;
  person_id: string;
  project_id: string;
  ratio: number;
  start: string;
  end: string;
  phase_id: string | null;
}

export interface AssignedMember {
  person_id: string;
  fte_allocation: number; // 0–1
  phase_id: string | null;
}

export interface Team {
  id: string;
  project_id: string;
  members: AssignedMember[];
  is_optimized: boolean;
  optimization_score?: number | null;
  optimization_max_score?: number | null;
  coverage: PhaseCoverage[]; // empty for teams saved before coverage was tracked
  fully_covered: boolean | null;
  created_at: string | null; // ISO-8601 datetime; null for teams saved before it was tracked
  start_date: string | null; // ISO date the team was found at; null = the project's current dates
}

export interface Skill {
  id: string;
  description?: string;
}

export interface OptimizationWeights {
  performance: number; // skill fit & seniority
  chemistry: number; // pairwise affinity
  growth: number; // learning opportunities
  cost: number; // avoid over-qualification
  handover: number; // keep people across consecutive phases
}

export interface OptimizationRequest {
  project_id: string;
  weights: OptimizationWeights;
  respect_exclusions: boolean;
  n_alternatives: number; // 0–5 runner-up teams to return after the best one
}

// A ranked runner-up team; not persisted until promoted via teamsApi.create.
export interface TeamProposal {
  members: AssignedMember[];
  optimization_score: number;
  optimization_max_score: number;
  coverage: PhaseCoverage[];
  fully_covered: boolean | null;
  start_date: string | null;
}

// skill_id is the SkillRequirement id; met means some staffed member reaches required_level.
export interface SkillCoverage {
  skill_id: string;
  required_level: number;
  best_level: number; // 0 when no staffed member has the skill
  covered_fte: number; // FTE staffed by members at or above required_level
  met: boolean;
}

// One per phase in project.phases order; a project without phases has a single entry with phase_id null.
export interface PhaseCoverage {
  phase_id: string | null;
  required_fte: number;
  staffed_fte: number;
  available_fte: number; // what the eligible pool could supply during the phase
  fte_met: boolean;
  skills: SkillCoverage[];
}

export type InfeasibilityReason =
  | "squad_conflict"
  | "forced_member_conflict"
  | "squad_and_forced_member_conflict"
  | "fte_not_reachable";

export interface PhaseConflict {
  phase_id: string | null;
  reason: InfeasibilityReason;
  required_fte: number; // the phase's n_slots
  need_fte: number; // FTE the solver had to staff exactly, after capping by pool capacity
  squad_indices: number[]; // positions in project.squads
  forced_person_ids: string[]; // subset of project.included_person_ids
}

// `detail` of the 409 returned by optimizationApi.solve when no team is feasible.
export interface InfeasibilityDetail {
  message: string;
  project_id: string;
  conflicts: PhaseConflict[];
}

// One weekly start tried inside a project's start_window; the score fields and team are null
// when infeasible. The team is not persisted: it is promoted like an alternative.
export interface StartCandidate {
  start: string; // ISO date (YYYY-MM-DD)
  feasible: boolean;
  score: number | null;
  max_score: number | null;
  fully_covered: boolean | null;
  team: TeamProposal | null; // its start_date equals start
}

export interface OptimizationResponse {
  best: Team;
  alternatives: TeamProposal[];
  start_candidates: StartCandidate[]; // empty when the project has no start_window
}

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  roles: string[];
  permissions: string[];
}

export type OrganizationRole = "owner" | "contributor";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

// Membership is many-to-many, so a user's role lives per-organization rather than on User.
export interface OrganizationMembership extends Organization {
  role: OrganizationRole;
  member_count: number;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  role: OrganizationRole;
}

export interface OrganizationDetail extends Organization {
  members: OrganizationMember[];
}
