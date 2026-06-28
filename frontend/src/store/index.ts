import { create } from "zustand";
import type { Person, Project, Team, Skill, OptimizationWeights } from "@/types";
import { peopleApi, projectsApi, teamsApi, skillsApi } from "@/services/api";

interface AppState {
  people: Person[];
  projects: Project[];
  teams: Team[];
  skills: Skill[];
  optimizationWeights: OptimizationWeights;
  isLoading: boolean;
  error: string | null;

  fetchPeople: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchTeams: () => Promise<void>;
  fetchSkills: () => Promise<void>;

  savePerson: (data: Omit<Person, "id">, id?: string) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  saveProject: (data: Omit<Project, "id">, id?: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;

  setWeights: (weights: Partial<OptimizationWeights>) => void;
  clearError: () => void;
}

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export const useAppStore = create<AppState>((set, get) => ({
  people: [],
  projects: [],
  teams: [],
  skills: [],
  optimizationWeights: {
    performance: 0.25,
    chemistry: 0.25,
    growth: 0.25,
    cost: 0.25,
    handover: 0.0,
  },
  isLoading: false,
  error: null,

  fetchPeople: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ people: await peopleApi.list() });
    } catch (e) {
      set({ error: message(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ projects: await projectsApi.list() });
    } catch (e) {
      set({ error: message(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTeams: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ teams: await teamsApi.list() });
    } catch (e) {
      set({ error: message(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSkills: async () => {
    try {
      set({ skills: await skillsApi.list() });
    } catch (e) {
      set({ error: message(e) });
    }
  },

  savePerson: async (data, id) => {
    set({ error: null });
    try {
      if (id) await peopleApi.update(id, data);
      else await peopleApi.create(data);
      await get().fetchPeople();
    } catch (e) {
      set({ error: message(e) });
      throw e;
    }
  },

  deletePerson: async (id) => {
    set({ error: null });
    try {
      await peopleApi.delete(id);
      await get().fetchPeople();
    } catch (e) {
      set({ error: message(e) });
    }
  },

  saveProject: async (data, id) => {
    set({ error: null });
    try {
      if (id) await projectsApi.update(id, data);
      else await projectsApi.create(data);
      await get().fetchProjects();
    } catch (e) {
      set({ error: message(e) });
      throw e;
    }
  },

  deleteProject: async (id) => {
    set({ error: null });
    try {
      await projectsApi.delete(id);
      await get().fetchProjects();
    } catch (e) {
      set({ error: message(e) });
    }
  },

  deleteTeam: async (id) => {
    set({ error: null });
    try {
      await teamsApi.delete(id);
      await get().fetchTeams();
    } catch (e) {
      set({ error: message(e) });
    }
  },

  setWeights: (weights) =>
    set((state) => ({
      optimizationWeights: { ...state.optimizationWeights, ...weights },
    })),

  clearError: () => set({ error: null }),
}));

/** Distinct skill ids known across the skills catalog, people, and projects. */
export function knownSkillIds(state: AppState): string[] {
  const ids = new Set<string>();
  state.skills.forEach((s) => ids.add(s.id));
  state.people.forEach((p) => {
    p.skills.forEach((s) => ids.add(s.id));
    p.preferences.forEach((s) => ids.add(s));
    p.growth_targets.forEach((s) => ids.add(s));
  });
  state.projects.forEach((pr) => {
    pr.skill_requirements.forEach((s) => ids.add(s.id));
    pr.phases.forEach((ph) => ph.skill_requirements.forEach((s) => ids.add(s.id)));
  });
  return [...ids].filter(Boolean).sort();
}
