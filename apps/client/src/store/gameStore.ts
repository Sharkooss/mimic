import { create } from 'zustand';
import type { RoomSnapshot, RoundResults, SeekerTarget } from '@mimic/shared';

interface GameState {
  connected: boolean;
  /** Id public de ce joueur (reçu du serveur via l'événement `session`). */
  playerId: string | null;
  room: RoomSnapshot | null;
  results: RoundResults | null;
  /** Cachés camouflés à afficher au chercheur (reçus au début de la recherche). */
  seekerTargets: SeekerTarget[];
  toast: string | null;
  setConnected: (v: boolean) => void;
  setPlayerId: (id: string) => void;
  setRoom: (room: RoomSnapshot | null) => void;
  setResults: (r: RoundResults | null) => void;
  setSeekerTargets: (t: SeekerTarget[]) => void;
  setToast: (msg: string | null) => void;
}

/** État global minimal côté client (étendu au fil des phases de jeu). */
export const useGameStore = create<GameState>((set) => ({
  connected: false,
  playerId: null,
  room: null,
  results: null,
  seekerTargets: [],
  toast: null,
  setConnected: (connected) => set({ connected }),
  setPlayerId: (playerId) => set({ playerId }),
  setRoom: (room) => set({ room }),
  setResults: (results) => set({ results }),
  setSeekerTargets: (seekerTargets) => set({ seekerTargets }),
  setToast: (toast) => set({ toast }),
}));
