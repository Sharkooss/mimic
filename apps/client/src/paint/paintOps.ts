import { CHARACTER_SIZE } from '@mimic/shared';

/**
 * Opérations de peinture pures sur un buffer RGBA de personnage (CHARACTER_SIZE²).
 * Partagées par les présentations (éditeur isolé, peinture sur le tableau) via le
 * hook useCharacterPainting. Toute peinture est bornée à la silhouette (masque).
 */

const S = CHARACTER_SIZE;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Applique une empreinte carrée de pinceau centrée sur (cx,cy). */
export function paintStamp(
  px: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const [r, g, b] = hexToRgb(color);
  const half = Math.floor(size / 2);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = cx - half + dx;
      const y = cy - half + dy;
      if (x < 0 || x >= S || y < 0 || y >= S) continue;
      const idx = y * S + x;
      if (mask[idx] === 0) continue;
      px[idx * 4] = r;
      px[idx * 4 + 1] = g;
      px[idx * 4 + 2] = b;
      px[idx * 4 + 3] = 255;
    }
  }
}

/** Trace une ligne d'empreintes entre deux points (évite les trous en mouvement rapide). */
export function paintLine(
  px: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: string,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (steps === 0) {
    paintStamp(px, mask, x1, y1, size, color);
    return;
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintStamp(
      px,
      mask,
      Math.round(x0 + (x1 - x0) * t),
      Math.round(y0 + (y1 - y0) * t),
      size,
      color,
    );
  }
}

/** Remplissage par diffusion 4-connexe borné à la silhouette (pot de peinture). */
export function floodFill(
  px: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  cx: number,
  cy: number,
  color: string,
): void {
  const start = cy * S + cx;
  if (mask[start] === 0) return;
  const [nr, ng, nb] = hexToRgb(color);
  const o = start * 4;
  const tr = px[o]!;
  const tg = px[o + 1]!;
  const tb = px[o + 2]!;
  const ta = px[o + 3]!;
  if (tr === nr && tg === ng && tb === nb && ta === 255) return;
  const seen = new Uint8Array(S * S);
  const stack = [start];
  seen[start] = 1;
  const enqueue = (idx: number) => {
    if (!seen[idx] && mask[idx] !== 0) {
      seen[idx] = 1;
      stack.push(idx);
    }
  };
  while (stack.length) {
    const idx = stack.pop()!;
    const p = idx * 4;
    if (px[p] !== tr || px[p + 1] !== tg || px[p + 2] !== tb || px[p + 3] !== ta) continue;
    px[p] = nr;
    px[p + 1] = ng;
    px[p + 2] = nb;
    px[p + 3] = 255;
    const x = idx % S;
    const y = (idx / S) | 0;
    if (x > 0) enqueue(idx - 1);
    if (x < S - 1) enqueue(idx + 1);
    if (y > 0) enqueue(idx - S);
    if (y < S - 1) enqueue(idx + S);
  }
}

/** Couleur du pixel (cx,cy) en hex, ou null si transparent (pipette). */
export function pickColorAt(px: Uint8ClampedArray, cx: number, cy: number): string | null {
  const o = (cy * S + cx) * 4;
  if (px[o + 3] === 0) return null;
  return rgbToHex(px[o]!, px[o + 1]!, px[o + 2]!);
}
