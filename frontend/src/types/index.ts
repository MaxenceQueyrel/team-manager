export interface SkillLevel {
  skill_id: string;
  level: number; // 0–5
}

export interface Person {
  id: string;
  name: string;
  role: string;
  seniority: "junior" | "mid" | "senior" | "lead";
  years_of_experience: number;
  fte_capacity: number; // 0–1
  skills: SkillLevel[];
  growth_targets: string[]; // skill_ids the person wants to learn
  affinities: Record<string, number>; // person_id → score (-5 to +5)
}

export interface RoleRequirement {
  role: string;
  seniority?: string;
  count: number;
}

export interface SkillRequirement {
  skill_id: string;
  min_level: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  required_fte: number;
  role_requirements: RoleRequirement[];
  skill_requirements: SkillRequirement[];
  excluded_person_ids: string[];
  priority: "low" | "medium" | "high" | "critical";
}

export interface TeamMember {
  person_id: string;
  fte_allocation: number;
}

export interface Team {
  id: string;
  project_id: string;
  members: TeamMember[];
  is_optimized: boolean;
  optimization_score?: number;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface OptimizationWeights {
  performance_weight: number; // maximize skill match & experience
  chemistry_weight: number;   // maximize affinity scores
  growth_weight: number;      // maximize learning opportunities
  cost_weight: number;        // minimize over-qualification
}

export interface OptimizationRequest {
  project_id: string;
  weights: OptimizationWeights;
  respect_exclusions: boolean;
}
