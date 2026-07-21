import type { Artwork } from '@mimic/shared';
import { ARTWORKS_SEED } from './artworks.generated.js';

/**
 * Catalogue d'œuvres (issue #17). Généré depuis le Met Open Access (domaine
 * public). Pour tout régénérer : `scripts/prepare-artworks.mjs`. Pour AJOUTER
 * sans toucher à l'existant : `scripts/add-artworks.mjs` (incrémental, idempotent).
 */
export const ARTWORKS: Artwork[] = ARTWORKS_SEED;

/** Poids de tirage : les œuvres faciles (détaillées) sortent plus souvent. */
const weightOf = (a: Artwork): number => Math.max(1, 5 - a.difficulty);

function weightedPick(pool: Artwork[]): Artwork {
  const total = pool.reduce((s, a) => s + weightOf(a), 0);
  let r = Math.random() * total;
  for (const a of pool) {
    r -= weightOf(a);
    if (r <= 0) return a;
  }
  return pool[pool.length - 1]!;
}

/** Tire une séquence d'œuvres (une par manche), pondérée par difficulté, sans répétition. */
export function pickArtworkSequence(count: number): Artwork[] {
  const seq: Artwork[] = [];
  let pool = [...ARTWORKS];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool = [...ARTWORKS];
    const picked = weightedPick(pool);
    seq.push(picked);
    pool = pool.filter((a) => a.id !== picked.id);
  }
  return seq;
}
