// Pipeline de préparation des œuvres (issue #17).
// Source : Metropolitan Museum of Art « Open Access » (domaine public, CC0).
// Pour chaque artiste ciblé : recherche → 1re peinture PD avec image → téléchargement,
// downscale (≤ MAX_SIDE), difficulté auto (niveau de détail), écriture :
//   - image d'affichage   → apps/client/public/artworks/<slug>.jpg
//   - manifeste serveur    → apps/server/src/game/artworks.generated.ts
// Usage : node scripts/prepare-artworks.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const jpeg = require('jpeg-js');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_IMG = path.join(ROOT, 'apps/client/public/artworks');
const OUT_MANIFEST = path.join(ROOT, 'apps/server/src/game/artworks.generated.ts');
const MET = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MAX_SIDE = 1280;

/** Artistes ciblés (une œuvre chacun). Ordre = ordre du catalogue. */
const ARTISTS = [
  'Vincent van Gogh',
  'Claude Monet',
  'Paul Cézanne',
  'Pierre-Auguste Renoir',
  'Edgar Degas',
  'Rembrandt',
  'Johannes Vermeer',
  'Georges Seurat',
  'Paul Gauguin',
  'Camille Pissarro',
  'Édouard Manet',
  'John Singer Sargent',
  'Winslow Homer',
  'Gustave Courbet',
  'J. M. W. Turner',
  'Eugène Delacroix',
  'Camille Corot',
  'Jean-François Millet',
  'Alfred Sisley',
  'Berthe Morisot',
  'Mary Cassatt',
  'Henri de Toulouse-Lautrec',
  'Henri Rousseau',
  'James McNeill Whistler',
  'El Greco',
  'Francisco Goya',
  'Diego Velázquez',
  'Titian',
  'Nicolas Poussin',
  'Jean Honoré Fragonard',
  'Jacques Louis David',
  'Peter Paul Rubens',
  'Anthony van Dyck',
  'Frans Hals',
  'Sandro Botticelli',
  'Albrecht Dürer',
  'Hans Holbein the Younger',
  'Georges de La Tour',
  'Thomas Gainsborough',
  'John Constable',
  'Jean-Baptiste-Siméon Chardin',
  'Gustave Caillebotte',
  'Paul Signac',
  'Jean-Léon Gérôme',
  'William-Adolphe Bouguereau',
  'Rosa Bonheur',
  'Théodore Rousseau',
  'Nicolas Lancret',
];

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

const getJson = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'MimicGame/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
};

/** Downscale par moyenne de blocs vers (tw,th). Entrée/sortie RGBA. */
function downscale(src, sw, sh, tw, th) {
  const out = new Uint8Array(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor((tx * sw) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / tw));
      const y0 = Math.floor((ty * sh) / th);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / th));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n++;
        }
      }
      const o = (ty * tw + tx) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Difficulté 1-4 depuis le niveau de détail (gradient moyen sur la luminance). */
function difficultyOf(rgba, w, h) {
  const L = (i) => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  let sum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = (y * w + x) * 4;
      const gx = L(i + 4) - L(i - 4);
      const gy = L(i + w * 4) - L(i - w * 4);
      sum += Math.abs(gx) + Math.abs(gy);
      n++;
    }
  }
  const detail = sum / Math.max(1, n); // ~0 (plat) → ~50+ (très détaillé)
  // Plus c'est détaillé, plus il est facile de se cacher → difficulté basse.
  if (detail > 28) return 1;
  if (detail > 18) return 2;
  if (detail > 10) return 3;
  return 4;
}

async function pickForArtist(artist) {
  const last = artist.split(' ').pop();
  const q = encodeURIComponent(artist);
  const search = await getJson(`${MET}/search?hasImages=true&medium=Paintings&q=${q}`);
  const ids = (search.objectIDs || []).slice(0, 12);
  for (const id of ids) {
    let obj;
    try {
      obj = await getJson(`${MET}/objects/${id}`);
    } catch {
      continue;
    }
    if (!obj.isPublicDomain || !obj.primaryImage) continue;
    if (!obj.artistDisplayName || !obj.artistDisplayName.includes(last)) continue;
    return obj;
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_IMG, { recursive: true });
  const catalogue = [];
  const usedSlugs = new Set();

  for (const artist of ARTISTS) {
    await new Promise((r) => setTimeout(r, 400)); // politesse : évite le rate-limit du Met
    process.stdout.write(`• ${artist} … `);
    let obj;
    try {
      obj = await pickForArtist(artist);
    } catch (e) {
      console.log('recherche KO', e.message);
      continue;
    }
    if (!obj) {
      console.log('aucune œuvre PD trouvée');
      continue;
    }
    let slug = slugify(obj.title) || slugify(artist);
    while (usedSlugs.has(slug)) slug += '-2';
    usedSlugs.add(slug);

    try {
      const res = await fetch(obj.primaryImage, { headers: { 'User-Agent': 'MimicGame/1.0' } });
      if (!res.ok) throw new Error(`img HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const dec = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
      const scale = Math.min(1, MAX_SIDE / Math.max(dec.width, dec.height));
      const tw = Math.round(dec.width * scale);
      const th = Math.round(dec.height * scale);
      const rgba = scale < 1 ? downscale(dec.data, dec.width, dec.height, tw, th) : dec.data;
      const out = jpeg.encode({ data: rgba, width: tw, height: th }, 80);
      fs.writeFileSync(path.join(OUT_IMG, `${slug}.jpg`), out.data);

      catalogue.push({
        id: slug,
        title: obj.title.replace(/\s+/g, ' ').trim(),
        author: obj.artistDisplayName,
        year: (obj.objectDate || '').trim() || null,
        width: tw,
        height: th,
        difficulty: difficultyOf(rgba, tw, th),
        recommendedMaxPlayers: 8,
        maxZoom: 8,
        imageUrl: `/artworks/${slug}.jpg`,
      });
      console.log(`✓ ${slug} (${tw}×${th}, diff ${catalogue.at(-1).difficulty})`);
    } catch (e) {
      console.log('image KO', e.message);
    }
  }

  if (!catalogue.length) throw new Error('aucune œuvre préparée');

  const header = `// Généré par scripts/prepare-artworks.mjs — NE PAS ÉDITER À LA MAIN.
// Source : Metropolitan Museum of Art, Open Access (domaine public / CC0).
import type { Artwork } from '@mimic/shared';

export const ARTWORKS_SEED: Artwork[] = ${JSON.stringify(catalogue, null, 2)};
`;
  fs.writeFileSync(OUT_MANIFEST, header);
  console.log(`\n${catalogue.length} œuvres préparées → ${path.relative(ROOT, OUT_MANIFEST)}`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
