// Test du moteur de scoring (#14) sur des cas synthétiques.
// Usage: node scripts/test-camouflage.mjs (après build du serveur)
import { CHARACTER_SIZE, scoreCamouflage } from '../packages/shared/dist/index.js';

const S = CHARACTER_SIZE;

function make(fn) {
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * S + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  return px;
}

// Fond : léger dégradé bleu/teal (proche du placeholder).
const bg = make((x, y) => {
  const t = (x + y) / (2 * S);
  return [40 + t * 30, 120 + t * 40, 150 - t * 20, 255];
});

const cases = {
  'identique au fond': make((x, y) => [...rgbOf(bg, x, y), 255]),
  'couleur proche (+8)': make((x, y) => {
    const [r, g, b] = rgbOf(bg, x, y);
    return [r + 8, g + 8, b + 8, 255];
  }),
  'gris uni (moyenne)': make(() => [90, 130, 130, 255]),
  'rouge vif uni': make(() => [220, 30, 30, 255]),
  'blanc uni': make(() => [255, 255, 255, 255]),
  'damier noir/blanc': make((x, y) => {
    const c = (x + y) % 2 === 0 ? 255 : 0;
    return [c, c, c, 255];
  }),
  'bruit ±40 sur le fond': make((x, y) => {
    const [r, g, b] = rgbOf(bg, x, y);
    const n = () => (Math.random() * 2 - 1) * 40;
    return [r + n(), g + n(), b + n(), 255];
  }),
};

function rgbOf(px, x, y) {
  const i = (y * S + x) * 4;
  return [px[i], px[i + 1], px[i + 2]];
}

console.log('Cas'.padEnd(26), 'score  color  edge  contrast');
for (const [name, char] of Object.entries(cases)) {
  const s = scoreCamouflage(char, bg);
  console.log(
    name.padEnd(26),
    String(s.score).padStart(4),
    String(s.colorMatch).padStart(6),
    String(s.edgeMatch).padStart(6),
    String(s.contrast).padStart(7),
  );
}
