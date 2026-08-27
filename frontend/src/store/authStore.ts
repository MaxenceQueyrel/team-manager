import { create } from "zustand";
import { authApi, getAccessToken, setAccessToken, setOnAuthFailure } from "@/services/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  permissions: Set<string>;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  clearError: () => void;
}

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function loggedOutState() {
  setAccessToken(null);
  return { user: null, accessToken: null, permissions: new Set<string>() };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  permissions: new Set(),
  isLoading: false,
  isHydrated: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { access_token } = await authApi.login({ email, password });
      setAccessToken(access_token);
      const user = await authApi.me();
      set({ user, accessToken: access_token, permissions: new Set(user.permissions) });
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
      set({ user, accessToken: getAccessToken(), permissions: new Set(user.permissions) });
    } catch {
      set(loggedOutState());
    } finally {
      set({ isHydrated: true });
    }
  },

  clearError: () => set({ error: null }),
}));

setOnAuthFailure(() => useAuthStore.setState(loggedOutState()));
