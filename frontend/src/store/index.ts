import { create } from "zustand";
import type { Person, Project, Team, OptimizationWeights } from "@/types";
import { peopleApi, projectsApi, teamsApi } from "@/services/api";

interface AppState {
  people: Person[];
  projects: Project[];
  teams: Team[];
  optimizationWeights: OptimizationWeights;
  isLoading: boolean;
  error: string | null;
  fetchPeople: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchTeams: () => Promise<void>;
  setWeights: (weights: Partial<OptimizationWeights>) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  people: [],
  projects: [],
  teams: [],
  optimizationWeights: {
    performance_weight: 0.25,
    chemistry_weight: 0.25,
    growth_weight: 0.25,
    cost_weight: 0.25,
  },
  isLoading: false,
  error: null,

  fetchPeople: async () => {
    set({ isLoading: true, error: null });
    try {
      const people = await peopleApi.list();
      set({ people });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectsApi.list();
      set({ projects });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTeams: async () => {
    set({ isLoading: true, error: null });
    try {
      const teams = await teamsApi.list();
      set({ teams });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  setWeights: (weights) =>
    set((state) => ({
      optimizationWeights: { ...state.optimizationWeights, ...weights },
    })),

  clearError: () => set({ error: null }),
}));
