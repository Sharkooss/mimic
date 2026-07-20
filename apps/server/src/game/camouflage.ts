import type { CamouflageBreakdown } from '@mimic/shared';

/**
 * Calcul du score de camouflage (0-100).
 *
 * STUB — implémentation de référence à compléter (voir issue "Moteur de scoring").
 * L'algorithme final combinera plusieurs critères pondérés :
 *  - colorMatch : distance couleur moyenne perso ↔ fond (idéalement en LAB / ΔE).
 *  - edgeMatch  : cohérence des contours (le perso ne doit pas "trancher").
 *  - contrast   : le personnage ne doit pas ressortir en contraste local.
 *
 * @param character  pixels RGBA du personnage (size*size*4)
 * @param background pixels RGBA de la zone du tableau sous le personnage (même longueur)
 */
export function scoreCamouflage(
  character: Uint8ClampedArray | number[],
  background: Uint8ClampedArray | number[],
): CamouflageBreakdown {
  const len = Math.min(character.length, background.length);
  let sumDelta = 0;
  let opaquePixels = 0;

  for (let i = 0; i < len; i += 4) {
    const alpha = character[i + 3] ?? 0;
    if (alpha === 0) continue; // pixel transparent = hors silhouette
    opaquePixels++;
    const dr = (character[i] ?? 0) - (background[i] ?? 0);
    const dg = (character[i + 1] ?? 0) - (background[i + 1] ?? 0);
    const db = (character[i + 2] ?? 0) - (background[i + 2] ?? 0);
    // Distance euclidienne pondérée (approximation perceptuelle simple).
    sumDelta += Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
  }

  if (opaquePixels === 0) {
    return { score: 0, colorMatch: 0, edgeMatch: 0, contrast: 0 };
  }

  const avgDelta = sumDelta / opaquePixels; // 0 (parfait) → ~255 (opposé)
  const colorMatch = clamp(100 - (avgDelta / 128) * 100);

  // TODO: contours & contraste réels. Pour l'instant on reflète colorMatch.
  const edgeMatch = colorMatch;
  const contrast = colorMatch;

  const score = Math.round(0.6 * colorMatch + 0.25 * edgeMatch + 0.15 * contrast);
  return {
    score: clamp(score),
    colorMatch: Math.round(colorMatch),
    edgeMatch: Math.round(edgeMatch),
    contrast: Math.round(contrast),
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
