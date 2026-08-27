import axios from "axios";
import type {
  Assignment,
  OptimizationRequest,
  Person,
  PersonAvailability,
  Project,
  Role,
  Skill,
  Team,
  User,
} from "@/types";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // sends the httpOnly refresh cookie
});

// Kept in memory only (never localStorage) so an XSS payload can't read it off disk.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let onAuthFailure: (() => void) | null = null;

/** Registers the callback run when a token refresh fails (e.g. to force logout). */
export function setOnAuthFailure(handler: (() => void) | null): void {
  onAuthFailure = handler;
}

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // /auth/me is allowed to retry (that's how hydrate silently restores a session from
    // the refresh cookie); login/register/refresh/logout must not, or a bad-password 401
    // would surface as a refresh failure instead of "Invalid email or password".
    const isRetryableAuthEndpoint = !/\/auth\/(login|register|refresh|logout)(\?|$)/.test(
      original.url ?? "",
    );
    if (error.response?.status !== 401 || original._retry || !isRetryableAuthEndpoint) {
      return Promise.reject(error);
    }
    original._retry = true;

    try {
      refreshPromise ??= authApi.refresh().then(({ access_token }) => {
        setAccessToken(access_token);
        return access_token;
      });
      const token = await refreshPromise;
      refreshPromise = null;
      original.headers.Authorization = `Bearer ${token}`;
      return client(original);
    } catch (refreshError) {
      refreshPromise = null;
      setAccessToken(null);
      onAuthFailure?.();
      return Promise.reject(refreshError);
    }
  },
);

export const authApi = {
  register: (data: { email: string; password: string }) =>
    client.post<User>("/api/v1/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    client
      .post<{ access_token: string; token_type: string }>("/api/v1/auth/login", data)
      .then((r) => r.data),
  logout: () => client.post("/api/v1/auth/logout"),
  refresh: () =>
    client
      .post<{ access_token: string; token_type: string }>("/api/v1/auth/refresh")
      .then((r) => r.data),
  me: () => client.get<User>("/api/v1/auth/me").then((r) => r.data),
};

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

type AssignmentPayload = Omit<Assignment, "id">;

export const assignmentsApi = {
  list: (params?: { person_id?: string; project_id?: string }) =>
    client.get<Assignment[]>("/api/v1/assignments/", { params }).then((r) => r.data),
  get: (id: string) => client.get<Assignment>(`/api/v1/assignments/${id}`).then((r) => r.data),
  create: (data: AssignmentPayload) =>
    client.post<Assignment>("/api/v1/assignments/", data).then((r) => r.data),
  update: (id: string, data: AssignmentPayload) =>
    client.put<Assignment>(`/api/v1/assignments/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/api/v1/assignments/${id}`),
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
