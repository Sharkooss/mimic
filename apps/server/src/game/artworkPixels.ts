import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { CHARACTER_SIZE, placeholderColorAt, type Artwork } from '@mimic/shared';
import { env } from '../env.js';

/**
 * Échantillonnage des vrais pixels d'une œuvre pour le scoring de camouflage (#17).
 * Les images d'affichage (apps/client/public|dist/artworks/<id>.jpg) sont décodées
 * une fois (jpeg-js) puis mises en cache. Les dimensions de l'image = dimensions de
 * l'œuvre, donc les coordonnées du tableau adressent directement les pixels image.
 * Repli sur le placeholder déterministe si l'image est absente.
 */

const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js') as {
  decode: (
    buf: Buffer,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ) => { width: number; height: number; data: Uint8Array };
};

const S = CHARACTER_SIZE;
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Répertoires candidats où trouver les images (prod: client/dist, dev: client/public). */
const DIRS = [
  env.CLIENT_DIST_PATH,
  resolve(__dirname, '../..', env.CLIENT_DIST_PATH),
  resolve(__dirname, '../../../client/dist'),
  resolve(__dirname, '../../../client/public'),
].map((base) => join(base, 'artworks'));

interface Decoded {
  w: number;
  h: number;
  data: Uint8Array;
}

const cache = new Map<string, Decoded | null>();

function load(artwork: Artwork): Decoded | null {
  const cached = cache.get(artwork.id);
  if (cached !== undefined) return cached;
  let decoded: Decoded | null = null;
  for (const dir of DIRS) {
    const file = join(dir, `${artwork.id}.jpg`);
    if (!existsSync(file)) continue;
    try {
      const d = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true });
      decoded = { w: d.width, h: d.height, data: d.data };
    } catch {
      decoded = null;
    }
    break;
  }
  cache.set(artwork.id, decoded);
  return decoded;
}

/** Échantillonne l'empreinte S×S du personnage placé à (ox,oy) dans l'œuvre. */
export function sampleArtworkBackground(
  artwork: Artwork | null,
  ox: number,
  oy: number,
): Uint8ClampedArray {
  const bg = new Uint8ClampedArray(S * S * 4);
  const dec = artwork ? load(artwork) : null;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const idx = (j * S + i) * 4;
      let r = 128;
      let g = 128;
      let b = 128;
      if (dec) {
        const sx = Math.min(dec.w - 1, Math.max(0, ox + i));
        const sy = Math.min(dec.h - 1, Math.max(0, oy + j));
        const si = (sy * dec.w + sx) * 4;
        r = dec.data[si]!;
        g = dec.data[si + 1]!;
        b = dec.data[si + 2]!;
      } else if (artwork) {
        [r, g, b] = placeholderColorAt(artwork.id, artwork.width, artwork.height, ox + i, oy + j);
      }
      bg[idx] = r;
      bg[idx + 1] = g;
      bg[idx + 2] = b;
      bg[idx + 3] = 255;
    }
  }
  return bg;
}
