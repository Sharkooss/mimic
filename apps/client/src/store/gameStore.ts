import { create } from 'zustand';
import type { RoomSnapshot, RoundResults } from '@mimic/shared';

interface GameState {
  connected: boolean;
  room: RoomSnapshot | null;
  results: RoundResults | null;
  toast: string | null;
  setConnected: (v: boolean) => void;
  setRoom: (room: RoomSnapshot | null) => void;
  setResults: (r: RoundResults | null) => void;
  setToast: (msg: string | null) => void;
}

/** État global minimal côté client (étendu au fil des phases de jeu). */
export const useGameStore = create<GameState>((set) => ({
  connected: false,
  room: null,
  results: null,
  toast: null,
  setConnected: (connected) => set({ connected }),
  setRoom: (room) => set({ room }),
  setResults: (results) => set({ results }),
  setToast: (toast) => set({ toast }),
}));
