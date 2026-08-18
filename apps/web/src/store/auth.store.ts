import { useSyncExternalStore } from "react";
import type { LoginResponse, UserProfileResponse } from "@veolms/contracts";

export type AuthUser = UserProfileResponse | LoginResponse["user"];

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

let state: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export const authStore = {
  getState(): AuthState {
    return state;
  },

  setUser(user: AuthUser | null) {
    state = {
      ...state,
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
    };
    notify();
  },

  setLoading(isLoading: boolean) {
    state = {
      ...state,
      isLoading,
    };
    notify();
  },

  clearAuth() {
    state = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
    };
    notify();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useAuthStore<T = AuthState>(
  selector: (s: AuthState) => T = (s) => s as unknown as T,
): T {
  return useSyncExternalStore(
    authStore.subscribe,
    () => selector(authStore.getState()),
    () => selector(authStore.getState()),
  );
}
