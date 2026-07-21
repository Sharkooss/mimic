import { CHARACTER_SIZE, type Artwork } from '@mimic/shared';

const S = CHARACTER_SIZE;

/** Charge une image (crossOrigin anonyme pour pouvoir lire ses pixels). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`chargement de ${url} échoué`));
    img.src = url;
  });
}

/**
 * Construit un `Artwork` complet depuis une entrée de catalogue + une image déjà
 * chargée (les dimensions de l'image = celles de l'œuvre, cf. pipeline #17).
 */
export function artworkFromImage(
  entry: {
    id: string;
    title: string;
    author: string;
    year: string | null;
    imageUrl: string;
    difficulty: number;
  },
  img: HTMLImageElement,
): Artwork {
  return {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    year: entry.year,
    width: img.naturalWidth,
    height: img.naturalHeight,
    difficulty: entry.difficulty as Artwork['difficulty'],
    recommendedMaxPlayers: 8,
    maxZoom: 8,
    imageUrl: entry.imageUrl,
  };
}

/**
 * Échantillonne la zone S×S de l'œuvre située derrière le personnage placé en
 * (ox,oy), en RGBA — pour rejouer le scoring de camouflage côté client (mode local).
 * Les coordonnées sont bornées pour rester dans l'image.
 */
export function sampleBackground(img: HTMLImageElement, ox: number, oy: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Uint8ClampedArray(S * S * 4);
  ctx.drawImage(img, 0, 0);
  const x = Math.max(0, Math.min(img.naturalWidth - S, Math.round(ox)));
  const y = Math.max(0, Math.min(img.naturalHeight - S, Math.round(oy)));
  return ctx.getImageData(x, y, S, S).data;
}
