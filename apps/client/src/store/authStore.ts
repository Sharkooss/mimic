import { create } from 'zustand';
import type { PublicUser } from '@mimic/shared';

interface AuthState {
  /** Compte connecté, ou null (invité). */
  user: PublicUser | null;
  /** Le serveur propose-t-il les comptes (base configurée) ? */
  enabled: boolean;
  /** Amorçage terminé (fetchMe + /api/version). */
  ready: boolean;
  setUser: (user: PublicUser | null) => void;
  setEnabled: (enabled: boolean) => void;
  setReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  enabled: false,
  ready: false,
  setUser: (user) => set({ user }),
  setEnabled: (enabled) => set({ enabled }),
  setReady: (ready) => set({ ready }),
}));
