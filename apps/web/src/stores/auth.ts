/**
 * Auth session, persisted to localStorage so a refresh keeps the user signed in.
 *
 * A cookie would be tidier, but the API is on another origin and the token has
 * to be attached as a header, so it lives here where the fetch client can read
 * it synchronously.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SessionUser } from "@/lib/types";

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  setSession: (token: string, user: SessionUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setSession: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: "junaidi-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Flag hydration so guards do not redirect during the first paint.
        if (state) state.hydrated = true;
      },
    },
  ),
);

export const isAdmin = (user: SessionUser | null): boolean => user?.role === "admin";
