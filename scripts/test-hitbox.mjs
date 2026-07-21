// Test de la hitbox au pixel près (characterHit) + inversion de rotation.
// Usage : node scripts/test-hitbox.mjs   (après build du serveur + shared)
import { CHARACTER_SIZE, HIT_TOLERANCE, characterHit } from '../packages/shared/dist/index.js';

const S = CHARACTER_SIZE;
let failed = 0;
const check = (cond, msg) => {
  if (!cond) {
    console.error('❌', msg);
    failed++;
  }
};

// Personnage entièrement transparent sauf un unique pixel opaque en (sx, sy).
function withOpaquePixel(sx, sy) {
  const px = new Uint8ClampedArray(S * S * 4);
  px[(sy * S + sx) * 4 + 3] = 255;
  return px;
}

// Placement à (100, 200) dans l'espace tableau.
const OX = 100;
const OY = 200;

// --- rotation 0 : le pixel (10,12) s'affiche tel quel ---
{
  const px = withOpaquePixel(10, 12);
  check(characterHit(px, OX, OY, 0, OX + 10, OY + 12), 'rot0: clic pile sur le pixel');
  check(
    characterHit(px, OX, OY, 0, OX + 10 + HIT_TOLERANCE, OY + 12),
    'rot0: clic à la tolérance = touché',
  );
  check(
    !characterHit(px, OX, OY, 0, OX + 10 + HIT_TOLERANCE + 2, OY + 12),
    'rot0: clic au-delà de la tolérance = raté',
  );
  check(!characterHit(px, OX, OY, 0, OX + 40, OY + 40), 'rot0: clic dans le vide (boîte) = raté');
}

// --- rotations : le pixel source (10,12) doit être touché à sa position AFFICHÉE ---
// display(dx,dy) attendu pour source(10,12) selon la rotation CSS horaire :
//  90°  -> (S-1-12, 10) = (S-13, 10)
//  180° -> (S-1-10, S-1-12) = (S-11, S-13)
//  270° -> (12, S-1-10) = (12, S-11)
const cases = [
  { rot: 90, dx: S - 1 - 12, dy: 10 },
  { rot: 180, dx: S - 1 - 10, dy: S - 1 - 12 },
  { rot: 270, dx: 12, dy: S - 1 - 10 },
];
for (const c of cases) {
  const px = withOpaquePixel(10, 12);
  check(
    characterHit(px, OX, OY, c.rot, OX + c.dx, OY + c.dy),
    `rot${c.rot}: clic sur la position affichée du pixel`,
  );
  // Un clic à la position NON tournée (10,12) ne doit PAS toucher (sauf coïncidence).
  const naive = Math.abs(c.dx - 10) <= HIT_TOLERANCE && Math.abs(c.dy - 12) <= HIT_TOLERANCE;
  if (!naive) {
    check(
      !characterHit(px, OX, OY, c.rot, OX + 10, OY + 12),
      `rot${c.rot}: clic à la position non tournée = raté`,
    );
  }
}

// --- silhouette pleine : la hitbox couvre toute la boîte (comportement d'avant) ---
{
  const full = new Uint8ClampedArray(S * S * 4).fill(255);
  check(characterHit(full, OX, OY, 0, OX + S / 2, OY + S / 2), 'plein: centre touché');
  check(characterHit(full, OX, OY, 0, OX + 1, OY + 1), 'plein: coin touché');
}

if (failed) {
  console.error(`\n${failed} assertion(s) en échec.`);
  process.exit(1);
}
console.log('✅ Hitbox au pixel près + rotations : OK');
