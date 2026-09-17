import { create } from "zustand";
import {
  authApi,
  getAccessToken,
  organizationsApi,
  setAccessToken,
  setActiveOrganizationId,
  setOnAuthFailure,
} from "@/services/api";
import type { OrganizationMembership, User } from "@/types";

const ACTIVE_ORG_STORAGE_KEY = "activeOrganizationId";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  permissions: Set<string>;
  organizations: OrganizationMembership[];
  activeOrganizationId: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;

  setActiveOrganization: (id: string) => void;
  createOrganization: (name: string) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

/** Keeps the persisted choice in sync with the axios header used to scope org-scoped requests. */
function applyActiveOrganization(id: string | null) {
  setActiveOrganizationId(id);
  if (id) {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  }
}

/** Prefers the persisted/previous choice if it's still a membership, else the first available. */
function pickActiveOrganizationId(
  organizations: OrganizationMembership[],
  preferredId: string | null,
): string | null {
  if (preferredId && organizations.some((o) => o.id === preferredId)) return preferredId;
  return organizations[0]?.id ?? null;
}

async function loadOrganizations(): Promise<{
  organizations: OrganizationMembership[];
  activeOrganizationId: string | null;
}> {
  const organizations = await organizationsApi.list();
  const activeOrganizationId = pickActiveOrganizationId(
    organizations,
    localStorage.getItem(ACTIVE_ORG_STORAGE_KEY),
  );
  applyActiveOrganization(activeOrganizationId);
  return { organizations, activeOrganizationId };
}

function loggedOutState() {
  setAccessToken(null);
  applyActiveOrganization(null);
  return {
    user: null,
    accessToken: null,
    permissions: new Set<string>(),
    organizations: [] as OrganizationMembership[],
    activeOrganizationId: null,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  permissions: new Set(),
  organizations: [],
  activeOrganizationId: null,
  isLoading: false,
  isHydrated: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { access_token } = await authApi.login({ email, password });
      setAccessToken(access_token);
      const user = await authApi.me();
      const { organizations, activeOrganizationId } = await loadOrganizations();
      set({
        user,
        accessToken: access_token,
        permissions: new Set(user.permissions),
        organizations,
        activeOrganizationId,
      });
    } catch (e) {
      set(loggedOutState());
      set({ error: message(e) });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register({ email, password });
      await get().login(email, password);
    } catch (e) {
      set({ error: message(e) });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Cookie may already be expired/revoked server-side; local state is cleared regardless.
    }
    set(loggedOutState());
  },

  hydrate: async () => {
    try {
      // No access token exists yet on a fresh page load: this 401s and the response
      // interceptor transparently refreshes from the httpOnly cookie and retries.
      const user = await authApi.me();
      const { organizations, activeOrganizationId } = await loadOrganizations();
      set({
        user,
        accessToken: getAccessToken(),
        permissions: new Set(user.permissions),
        organizations,
        activeOrganizationId,
      });
    } catch {
      set(loggedOutState());
    } finally {
      set({ isHydrated: true });
    }
  },

  updatePassword: async (password) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.updateMe({ password });
    } catch (e) {
      set({ error: message(e) });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteAccount: async () => {
    set({ isLoading: true, error: null });
    try {
      await authApi.deleteMe();
      set(loggedOutState());
    } catch (e) {
      set({ error: message(e) });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),

  setActiveOrganization: (id) => {
    applyActiveOrganization(id);
    set({ activeOrganizationId: id });
  },

  createOrganization: async (name) => {
    set({ isLoading: true, error: null });
    try {
      const organization = await organizationsApi.create({ name });
      const organizations = await organizationsApi.list();
      applyActiveOrganization(organization.id);
      set({ organizations, activeOrganizationId: organization.id });
    } catch (e) {
      set({ error: message(e) });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  refreshOrganizations: async () => {
    const organizations = await organizationsApi.list();
    const activeOrganizationId = pickActiveOrganizationId(
      organizations,
      get().activeOrganizationId,
    );
    applyActiveOrganization(activeOrganizationId);
    set({ organizations, activeOrganizationId });
  },
}));

setOnAuthFailure(() => useAuthStore.setState(loggedOutState()));
