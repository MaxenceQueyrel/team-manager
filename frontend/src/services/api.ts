import axios from "axios";
import type { Person, Project, Team, Skill, OptimizationRequest } from "@/types";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  headers: { "Content-Type": "application/json" },
});

export const peopleApi = {
  list: () => client.get<Person[]>("/api/v1/people/").then((r) => r.data),
  get: (id: string) => client.get<Person>(`/api/v1/people/${id}`).then((r) => r.data),
  create: (data: Omit<Person, "id">) =>
    client.post<Person>("/api/v1/people/", data).then((r) => r.data),
  update: (id: string, data: Omit<Person, "id">) =>
    client.put<Person>(`/api/v1/people/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/api/v1/people/${id}`),
};

export const projectsApi = {
  list: () => client.get<Project[]>("/api/v1/projects/").then((r) => r.data),
  get: (id: string) => client.get<Project>(`/api/v1/projects/${id}`).then((r) => r.data),
  create: (data: Omit<Project, "id">) =>
    client.post<Project>("/api/v1/projects/", data).then((r) => r.data),
  update: (id: string, data: Omit<Project, "id">) =>
    client.put<Project>(`/api/v1/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/api/v1/projects/${id}`),
};

export const teamsApi = {
  list: () => client.get<Team[]>("/api/v1/teams/").then((r) => r.data),
  get: (id: string) => client.get<Team>(`/api/v1/teams/${id}`).then((r) => r.data),
};

export const skillsApi = {
  list: () => client.get<Skill[]>("/api/v1/skills/").then((r) => r.data),
};

export const optimizationApi = {
  solve: (request: OptimizationRequest) =>
    client.post<Team>("/api/v1/optimization/solve", request).then((r) => r.data),
};
