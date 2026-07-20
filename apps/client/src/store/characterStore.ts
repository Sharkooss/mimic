import { create } from 'zustand';
import type { CharacterRotation } from '@mimic/shared';

interface CharacterState {
  /** Pixels RGBA peints du personnage (partagés éditeur ↔ plateau). */
  pixels: Uint8ClampedArray | null;
  /** Masque de la silhouette (255 = peignable). */
  mask: Uint8ClampedArray | null;
  /** Placement sur le tableau (coords de l'œuvre). */
  x: number;
  y: number;
  rotation: CharacterRotation;
  /** Compteur incrémenté à chaque mutation in-place des pixels (déclenche les redraws). */
  tick: number;
  /** true une fois le camouflage verrouillé (fige peinture + placement). */
  locked: boolean;

  setBase: (mask: Uint8ClampedArray, pixels: Uint8ClampedArray) => void;
  setPixels: (pixels: Uint8ClampedArray) => void;
  bump: () => void;
  setPlacement: (p: Partial<{ x: number; y: number; rotation: CharacterRotation }>) => void;
  setLocked: (locked: boolean) => void;
  reset: () => void;
}

/** État du personnage du joueur pour la manche courante. */
export const useCharacterStore = create<CharacterState>((set) => ({
  pixels: null,
  mask: null,
  x: 0,
  y: 0,
  rotation: 0,
  tick: 0,
  locked: false,
  setBase: (mask, pixels) => set({ mask, pixels, tick: 0 }),
  setPixels: (pixels) => set((s) => ({ pixels, tick: s.tick + 1 })),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  setPlacement: (p) => set(p),
  setLocked: (locked) => set({ locked }),
  reset: () => set({ pixels: null, mask: null, x: 0, y: 0, rotation: 0, tick: 0, locked: false }),
}));
