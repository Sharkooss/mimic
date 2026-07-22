import { CHARACTER_SIZE, type Artwork } from '@mimic/shared';

const S = CHARACTER_SIZE;

/** Fraction du temps de recherche écoulée avant l'apparition des zones d'indice. */
export const HINT_START_FRAC = 0.5;

/** Un caché dont on connaît la position (coin haut-gauche de l'empreinte). */
export interface HintHider {
  id: string;
  x: number;
  y: number;
}

export interface HintCircle {
  cx: number;
  cy: number;
  r: number;
}

/** Un groupe de cercles fusionnés (zone d'indice), avec le nombre de cachés dedans. */
export interface HintZone {
  key: string;
  circles: HintCircle[];
  count: number;
  labelX: number;
  labelY: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Rayon courant des zones (coords œuvre) : apparaît à HINT_START_FRAC puis
 * rétrécit jusqu'à la fin pour resserrer l'indice. `null` avant le déclenchement.
 */
export function hintRadius(elapsedFrac: number, artwork: Artwork): number | null {
  if (elapsedFrac < HINT_START_FRAC) return null;
  const t = clamp((elapsedFrac - HINT_START_FRAC) / (1 - HINT_START_FRAC), 0, 1);
  const rMax = clamp(Math.min(artwork.width, artwork.height) * 0.26, S * 2.6, S * 4.8);
  const rMin = S * 1.5;
  return rMax + (rMin - rMax) * t;
}

/** Hash stable d'une chaîne (FNV-1a) → offset déterministe, sans scintillement. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Cercle d'indice d'un caché : centré NON pas sur le joueur mais décalé (angle +
 * distance déterministes), tout en garantissant que le personnage entier reste à
 * l'intérieur (offset borné à r − demi-diagonale). Le joueur est donc dans la
 * zone sans en être le centre.
 */
function hintCircleFor(h: HintHider, r: number): HintCircle {
  const seed = hash(h.id);
  const angle = ((seed % 3600) / 3600) * Math.PI * 2;
  const magFrac = 0.36 + (((seed >>> 12) % 1000) / 1000) * 0.18; // 0.36 .. 0.54
  const charHalfDiag = S * 0.5 * Math.SQRT2;
  const maxOff = Math.max(0, r - charHalfDiag - 6);
  const mag = Math.min(magFrac * r, maxOff);
  const pcx = h.x + S / 2;
  const pcy = h.y + S / 2;
  return { cx: pcx + Math.cos(angle) * mag, cy: pcy + Math.sin(angle) * mag, r };
}

/**
 * Calcule les zones d'indice pour un ensemble de cachés non trouvés : un cercle
 * par joueur (décalé), puis fusion des cercles qui se chevauchent (union-find sur
 * la condition « distance des centres < somme des rayons ») en un seul blob joint,
 * étiqueté du nombre de cachés qu'il contient. Deux cercles trop éloignés restent
 * séparés (pas de chevauchement).
 */
export function computeHintZones(hiders: HintHider[], r: number): HintZone[] {
  const circles = hiders.map((h) => ({ ...hintCircleFor(h, r), id: h.id }));
  const n = circles.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i]! !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = circles[i]!;
      const b = circles[j]!;
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (dist < a.r + b.r) union(i, j); // chevauchement → fusion
    }
  }

  const groups = new Map<number, typeof circles>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(circles[i]!);
  }

  return [...groups.values()].map((g) => {
    const labelX = g.reduce((s, c) => s + c.cx, 0) / g.length;
    const labelY = g.reduce((s, c) => s + c.cy, 0) / g.length;
    return {
      key: g.map((c) => c.id).join('|'),
      circles: g.map((c) => ({ cx: c.cx, cy: c.cy, r: c.r })),
      count: g.length,
      labelX,
      labelY,
    };
  });
}
