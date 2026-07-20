/**
 * Fond « placeholder » déterministe pour une œuvre, tant que les vraies images
 * ne sont pas intégrées (#17). Client (rendu CSS) et serveur (échantillonnage
 * des pixels pour le scoring) partagent ces fonctions pour rester cohérents.
 */

export type Rgb = [number, number, number];

/** Hash stable d'un identifiant d'œuvre. */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Teintes du dégradé (mêmes valeurs que le CSS `linear-gradient(135deg, …)`). */
export function placeholderHues(id: string): { a: number; b: number } {
  const h = hashId(id);
  const a = h % 360;
  return { a, b: (a + 40) % 360 };
}

/** Bornes RGB du dégradé de l'œuvre. */
export function placeholderStops(id: string): { c1: Rgb; c2: Rgb } {
  const { a, b } = placeholderHues(id);
  return { c1: hslToRgb(a, 45, 62), c2: hslToRgb(b, 40, 42) };
}

/** Chaîne CSS du dégradé (rendu client). */
export function placeholderCss(id: string): string {
  const { a, b } = placeholderHues(id);
  return `linear-gradient(135deg, hsl(${a} 45% 62%), hsl(${b} 40% 42%))`;
}

/** Couleur du fond au pixel (px,py) de l'œuvre — approximation diagonale du 135°. */
export function placeholderColorAt(
  id: string,
  width: number,
  height: number,
  px: number,
  py: number,
): Rgb {
  const { c1, c2 } = placeholderStops(id);
  const t = Math.max(0, Math.min(1, (px + py) / (width + height)));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}
