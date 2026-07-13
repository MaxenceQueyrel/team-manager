import axios from "axios";
import type {
  OptimizationRequest,
  Person,
  PersonAvailability,
  Project,
  Role,
  Skill,
  Team,
} from "@/types";

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
  availability: (start: string, end: string) =>
    client
      .get<PersonAvailability[]>("/api/v1/people/availability", { params: { start, end } })
      .then((r) => r.data),
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
  delete: (id: string) => client.delete(`/api/v1/teams/${id}`),
};

export const rolesApi = {
  list: () => client.get<Role[]>("/api/v1/roles/").then((r) => r.data),
  get: (id: string) => client.get<Role>(`/api/v1/roles/${id}`).then((r) => r.data),
  create: (data: Role) => client.post<Role>("/api/v1/roles/", data).then((r) => r.data),
  update: (id: string, data: Role) =>
    client.put<Role>(`/api/v1/roles/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/api/v1/roles/${id}`),
};

export const skillsApi = {
  list: () => client.get<Skill[]>("/api/v1/skills/").then((r) => r.data),
  get: (id: string) => client.get<Skill>(`/api/v1/skills/${id}`).then((r) => r.data),
  create: (data: Skill) => client.post<Skill>("/api/v1/skills/", data).then((r) => r.data),
  update: (id: string, data: Skill) =>
    client.put<Skill>(`/api/v1/skills/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/api/v1/skills/${id}`),
};

export const optimizationApi = {
  solve: (request: OptimizationRequest) =>
    client.post<Team>("/api/v1/optimization/solve", request).then((r) => r.data),
};
