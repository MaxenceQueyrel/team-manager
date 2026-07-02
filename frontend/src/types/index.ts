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

export interface Person {
  id: string;
  name: string;
  role: string;
  seniority: Seniority;
  years_of_experience: number;
  fte_capacity: number; // 0–1
  skills: SkillLevel[];
  availability_windows: AvailabilityWindow[];
  preferences: string[]; // skill ids the person prefers
  growth_targets: string[]; // skill ids the person wants to grow in
  affinities: Record<string, number>; // person_id → score (-5..+5)
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
  priority: Priority;
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
}
