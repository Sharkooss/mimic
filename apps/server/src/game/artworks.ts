import type { Artwork } from '@mimic/shared';

/**
 * Catalogue d'œuvres en dur (amorçage).
 * Le vrai pipeline (~50 tableaux, domaine public, images + métadonnées, base de
 * données) est traité par l'issue #17. Ici : juste de quoi faire tourner la
 * boucle de jeu. Les `imageUrl` pointent vers /artworks/*, à fournir plus tard.
 */
export const ARTWORKS: Artwork[] = [
  {
    id: 'starry-night',
    title: 'La Nuit étoilée',
    author: 'Vincent van Gogh',
    year: '1889',
    width: 1920,
    height: 1520,
    difficulty: 1,
    recommendedMaxPlayers: 10,
    maxZoom: 8,
    imageUrl: '/artworks/starry-night.jpg',
  },
  {
    id: 'impression-sunrise',
    title: 'Impression, soleil levant',
    author: 'Claude Monet',
    year: '1872',
    width: 1800,
    height: 1400,
    difficulty: 1,
    recommendedMaxPlayers: 10,
    maxZoom: 8,
    imageUrl: '/artworks/impression-sunrise.jpg',
  },
  {
    id: 'the-scream',
    title: 'Le Cri',
    author: 'Edvard Munch',
    year: '1893',
    width: 1500,
    height: 1900,
    difficulty: 2,
    recommendedMaxPlayers: 8,
    maxZoom: 8,
    imageUrl: '/artworks/the-scream.jpg',
  },
  {
    id: 'mona-lisa',
    title: 'La Joconde',
    author: 'Léonard de Vinci',
    year: '1503',
    width: 1400,
    height: 2000,
    difficulty: 3,
    recommendedMaxPlayers: 6,
    maxZoom: 10,
    imageUrl: '/artworks/mona-lisa.jpg',
  },
  {
    id: 'composition-red-blue-yellow',
    title: 'Composition en rouge, jaune et bleu',
    author: 'Piet Mondrian',
    year: '1930',
    width: 1600,
    height: 1600,
    difficulty: 4,
    recommendedMaxPlayers: 6,
    maxZoom: 6,
    imageUrl: '/artworks/mondrian.jpg',
  },
];

/** Tire une séquence d'œuvres (une par manche), sans répétition tant que possible. */
export function pickArtworkSequence(count: number): Artwork[] {
  const pool = [...ARTWORKS];
  // Mélange de Fisher-Yates.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const seq: Artwork[] = [];
  for (let i = 0; i < count; i++) {
    seq.push(pool[i % pool.length]!);
  }
  return seq;
}
