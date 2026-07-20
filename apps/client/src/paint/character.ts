import { CHARACTER_SIZE } from '@mimic/shared';

/** URL du PNG de silhouette (dans /public). Remplaçable par un vrai asset. */
export const CHARACTER_URL = '/character.png';

export interface CharacterBase {
  /** Masque de peinture : 1 octet par pixel, 255 = peignable, 0 = hors silhouette. */
  mask: Uint8ClampedArray;
  /** Pixels RGBA initiaux (blanc opaque dans la silhouette, transparent ailleurs). */
  pixels: Uint8ClampedArray;
}

/**
 * Charge le PNG du personnage et en extrait le masque (canal alpha) + un buffer
 * de pixels initial. On ne peint que là où le masque est opaque.
 */
export function loadCharacterBase(): Promise<CharacterBase> {
  const S = CHARACTER_SIZE;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = S;
      off.height = S;
      const ctx = off.getContext('2d');
      if (!ctx) return reject(new Error('canvas 2d indisponible'));
      // Ajuste la silhouette dans le carré S×S en préservant ses proportions (centrée).
      const scale = Math.min(S / img.width, S / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.clearRect(0, 0, S, S);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
      const src = ctx.getImageData(0, 0, S, S).data;

      const mask = new Uint8ClampedArray(S * S);
      const pixels = new Uint8ClampedArray(S * S * 4);
      for (let i = 0; i < S * S; i++) {
        // Seuil à 50 % pour une silhouette nette (bords anti-aliasés).
        const opaque = src[i * 4 + 3]! >= 128;
        mask[i] = opaque ? 255 : 0;
        if (opaque) {
          pixels[i * 4] = 255;
          pixels[i * 4 + 1] = 255;
          pixels[i * 4 + 2] = 255;
          pixels[i * 4 + 3] = 255;
        }
      }
      resolve({ mask, pixels });
    };
    img.onerror = () => reject(new Error(`chargement de ${CHARACTER_URL} échoué`));
    img.src = CHARACTER_URL;
  });
}
