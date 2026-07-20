// Test du scoring sur les VRAIES images d'œuvres (#17), sans serveur.
// Vérifie que sampleArtworkBackground échantillonne l'image réelle (pas le
// placeholder) et que le scoring réagit : match parfait ≈ 100, inversé bas.
// Usage : node scripts/test-artwork-scoring.mjs  (après build du serveur)
const { ARTWORKS } = await import('../apps/server/dist/game/artworks.js');
const { sampleArtworkBackground } = await import('../apps/server/dist/game/artworkPixels.js');
const { scoreCamouflage } = await import('../apps/server/dist/game/camouflage.js');

const S = 64;
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);

if (!ARTWORKS.length) fail('catalogue vide');
ok(`catalogue : ${ARTWORKS.length} œuvres`);

const art = ARTWORKS[0];
const x = Math.round((art.width - S) / 2);
const y = Math.round((art.height - S) / 2);
const bg = sampleArtworkBackground(art, x, y);

// Le fond doit varier (vraie image), pas être quasi uniforme.
let mn = 255;
let mx = 0;
for (let i = 0; i < bg.length; i += 4) {
  const l = 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2];
  mn = Math.min(mn, l);
  mx = Math.max(mx, l);
}
if (mx - mn < 8) fail(`fond quasi uniforme (amplitude ${(mx - mn).toFixed(1)}) — image non chargée ?`);
ok(`fond échantillonné depuis l'image réelle (amplitude luminance ${(mx - mn).toFixed(0)})`);

// Match parfait : personnage = fond, tout opaque.
const perfect = new Uint8ClampedArray(S * S * 4);
perfect.set(bg);
const sp = scoreCamouflage(perfect, bg);
if (sp.score < 95) fail(`match parfait devrait ≈ 100, obtenu ${sp.score}`);
ok(`match parfait sur "${art.title}" → ${sp.score}% (${JSON.stringify(sp)})`);

// Couleurs inversées : doit s'effondrer.
const bad = new Uint8ClampedArray(S * S * 4);
for (let i = 0; i < bad.length; i += 4) {
  bad[i] = 255 - bg[i];
  bad[i + 1] = 255 - bg[i + 1];
  bad[i + 2] = 255 - bg[i + 2];
  bad[i + 3] = 255;
}
const sb = scoreCamouflage(bad, bg);
if (sb.score > 45) fail(`couleurs inversées devraient être basses, obtenu ${sb.score}`);
ok(`couleurs inversées → ${sb.score}% (${JSON.stringify(sb)})`);

console.log('✅ test-artwork-scoring OK');
