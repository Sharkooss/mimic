import type { CamouflageBreakdown } from './types.js';

/**
 * Moteur de scoring du camouflage (0-100), issue #14. Partagé client/serveur :
 * le serveur l'utilise au verrouillage, le mode local le rejoue côté client.
 *
 * Trois critères perceptuels comparant le personnage à la zone du tableau qui se
 * trouve derrière lui (pixels alignés, même empreinte S×S) :
 *  - colorMatch : similarité de couleur, distance ΔE en CIELAB (perceptuelle).
 *  - edgeMatch  : accord des contours — le personnage ne doit pas introduire de
 *                 gradients (arêtes) absents du fond (magnitude de Sobel sur L).
 *  - contrast   : accord de la « quantité de contraste » interne (dispersion de
 *                 luminance) — un perso trop lisse ou trop chargé ressort.
 *
 * Seuls les pixels opaques (dans la silhouette) comptent ; les arêtes ne sont
 * évaluées qu'à l'intérieur (voisinage 3×3 entièrement opaque) pour ne pas
 * confondre le contour de la silhouette avec une vraie arête.
 */

/** Réglages (points de saturation des métriques). */
const DE_TO_ZERO = 50; // ΔE moyen où colorMatch atteint 0
const GRAD_NORM = 180; // écart moyen de gradient (sur L) où edgeMatch atteint 0
const SIGMA_TO_ZERO = 45; // écart d'écart-type de L où contrast atteint 0
const WEIGHTS = { color: 0.6, edge: 0.2, contrast: 0.2 };

type Pixels = Uint8ClampedArray | number[];

export function scoreCamouflage(character: Pixels, background: Pixels): CamouflageBreakdown {
  const len = Math.min(character.length, background.length);
  const S = Math.max(1, Math.round(Math.sqrt(len / 4)));
  const n = S * S;

  const Lc = new Float32Array(n); // luminance L* du personnage
  const Lb = new Float32Array(n); // luminance L* du fond
  const opaque = new Uint8Array(n);

  let sumDE = 0;
  let nOpaque = 0;

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const [lc, ac, bc] = srgbToLab(character[i] ?? 0, character[i + 1] ?? 0, character[i + 2] ?? 0);
    const [lb, ab, bb] = srgbToLab(
      background[i] ?? 0,
      background[i + 1] ?? 0,
      background[i + 2] ?? 0,
    );
    Lc[p] = lc;
    Lb[p] = lb;
    if ((character[i + 3] ?? 0) === 0) continue;
    opaque[p] = 1;
    nOpaque++;
    const dL = lc - lb;
    const da = ac - ab;
    const db = bc - bb;
    sumDE += Math.sqrt(dL * dL + da * da + db * db);
  }

  if (nOpaque === 0) return { score: 0, colorMatch: 0, edgeMatch: 0, contrast: 0 };

  // --- colorMatch : ΔE moyen (CIE76) ---
  const meanDE = sumDE / nOpaque;
  const colorMatch = clamp(100 - (meanDE / DE_TO_ZERO) * 100);

  // --- edgeMatch : accord des magnitudes de Sobel (L) à l'intérieur ---
  let sumGradDiff = 0;
  let nGrad = 0;
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      if (!interiorOpaque(opaque, S, x, y)) continue;
      sumGradDiff += Math.abs(sobel(Lc, S, x, y) - sobel(Lb, S, x, y));
      nGrad++;
    }
  }
  const meanGradDiff = nGrad > 0 ? sumGradDiff / nGrad : 0;
  const edgeMatch = clamp(100 - (meanGradDiff / GRAD_NORM) * 100);

  // --- contrast : accord de la dispersion de luminance sur la silhouette ---
  let mc = 0;
  let mb = 0;
  for (let p = 0; p < n; p++) {
    if (!opaque[p]) continue;
    mc += Lc[p]!;
    mb += Lb[p]!;
  }
  mc /= nOpaque;
  mb /= nOpaque;
  let vc = 0;
  let vb = 0;
  for (let p = 0; p < n; p++) {
    if (!opaque[p]) continue;
    vc += (Lc[p]! - mc) ** 2;
    vb += (Lb[p]! - mb) ** 2;
  }
  const sdc = Math.sqrt(vc / nOpaque);
  const sdb = Math.sqrt(vb / nOpaque);
  const contrast = clamp(100 - (Math.abs(sdc - sdb) / SIGMA_TO_ZERO) * 100);

  const score = Math.round(
    WEIGHTS.color * colorMatch + WEIGHTS.edge * edgeMatch + WEIGHTS.contrast * contrast,
  );
  return {
    score: clamp(score),
    colorMatch: Math.round(colorMatch),
    edgeMatch: Math.round(edgeMatch),
    contrast: Math.round(contrast),
  };
}

/** Magnitude du gradient de Sobel au pixel (x,y) d'un plan scalaire S×S. */
function sobel(L: Float32Array, S: number, x: number, y: number): number {
  const at = (dx: number, dy: number) => L[(y + dy) * S + (x + dx)]!;
  const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - (at(-1, -1) + 2 * at(-1, 0) + at(-1, 1));
  const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - (at(-1, -1) + 2 * at(0, -1) + at(1, -1));
  return Math.sqrt(gx * gx + gy * gy);
}

/** Vrai si tout le voisinage 3×3 autour de (x,y) est opaque. */
function interiorOpaque(opaque: Uint8Array, S: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!opaque[(y + dy) * S + (x + dx)]) return false;
    }
  }
  return true;
}

/** sRGB (0-255) → CIELAB (D65). */
function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = linear(r / 255);
  const lg = linear(g / 255);
  const lb = linear(b / 255);
  // sRGB → XYZ (D65)
  const X = lr * 0.4124 + lg * 0.3576 + lb * 0.1805;
  const Y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const Z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505;
  const fx = labF(X / 0.95047);
  const fy = labF(Y / 1.0);
  const fz = labF(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
