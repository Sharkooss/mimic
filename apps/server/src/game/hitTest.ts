import { CHARACTER_SIZE, HIT_TOLERANCE, type CharacterRotation } from '@mimic/shared';

const S = CHARACTER_SIZE;

/**
 * Hitbox au pixel près (issue hitbox trop large). Un clic ne « touche » un caché
 * que s'il tombe sur un pixel opaque de sa silhouette peinte — plus sur la boîte
 * englobante 96×96 dont la majeure partie est transparente. Une petite tolérance
 * (HIT_TOLERANCE px) reste, pour rester jouable au bord des contours.
 *
 * `pixels` est l'empreinte RGBA (S·S·4) telle que peinte (rotation 0) ; on
 * inverse la rotation d'affichage pour retrouver le pixel source visé.
 */
export function characterHit(
  pixels: Uint8ClampedArray,
  ox: number,
  oy: number,
  rotation: CharacterRotation,
  worldX: number,
  worldY: number,
): boolean {
  // Position du clic dans la boîte affichée (après rotation), en pixels.
  const dxc = worldX - ox;
  const dyc = worldY - oy;
  if (dxc < -HIT_TOLERANCE || dyc < -HIT_TOLERANCE) return false;
  if (dxc >= S + HIT_TOLERANCE || dyc >= S + HIT_TOLERANCE) return false;

  const tol = HIT_TOLERANCE;
  for (let ddy = -tol; ddy <= tol; ddy++) {
    for (let ddx = -tol; ddx <= tol; ddx++) {
      const dx = Math.round(dxc) + ddx;
      const dy = Math.round(dyc) + ddy;
      if (dx < 0 || dy < 0 || dx >= S || dy >= S) continue;
      const [sx, sy] = unrotate(dx, dy, rotation);
      if ((pixels[(sy * S + sx) * 4 + 3] ?? 0) > 0) return true;
    }
  }
  return false;
}

/** Coordonnées source (avant rotation d'affichage) d'un pixel affiché (dx,dy). */
function unrotate(dx: number, dy: number, rotation: CharacterRotation): [number, number] {
  switch (rotation) {
    case 90:
      return [dy, S - 1 - dx];
    case 180:
      return [S - 1 - dx, S - 1 - dy];
    case 270:
      return [S - 1 - dy, dx];
    default:
      return [dx, dy];
  }
}
