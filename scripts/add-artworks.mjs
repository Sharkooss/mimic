// Ajout INCRÉMENTAL d'œuvres (complément de prepare-artworks.mjs).
// Contrairement au pipeline complet, ce script PRÉSERVE le catalogue existant :
// il charge les œuvres déjà générées, va chercher de nouveaux artistes (absents
// du catalogue), télécharge + downscale leur 1re peinture du domaine public, et
// réécrit le manifeste = existant + nouveautés. Idempotent (re-jouable sans doublon).
// Source : Metropolitan Museum of Art, Open Access (domaine public / CC0).
// Usage : node scripts/add-artworks.mjs   (après build du serveur)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const jpeg = require('jpeg-js');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_IMG = path.join(ROOT, 'apps/client/public/artworks');
const OUT_MANIFEST = path.join(ROOT, 'apps/server/src/game/artworks.generated.ts');
const EXISTING_JS = path.join(ROOT, 'apps/server/dist/game/artworks.generated.js');
const MET = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MAX_SIDE = 1280;

/** Nouveaux artistes à ajouter : [requête de recherche, jeton de nom pour valider l'attribution]. */
const NEW_ARTISTS = [
  ['Claude Monet', 'Monet'],
  ['Mary Cassatt', 'Cassatt'],
  ['Gustave Caillebotte', 'Caillebotte'],
  ['Paul Signac', 'Signac'],
  ['Jean-Léon Gérôme', 'Gérôme'],
  ['William Bouguereau', 'Bouguereau'],
  ['Thomas Gainsborough', 'Gainsborough'],
  ['John Constable', 'Constable'],
  ['Jean Siméon Chardin', 'Chardin'],
  ['Sandro Botticelli', 'Botticelli'],
  ['Georges de La Tour', 'La Tour'],
  ['Ingres', 'Ingres'],
  ['Théodore Géricault', 'Géricault'],
  ['François Boucher', 'Boucher'],
  ['Antoine Watteau', 'Watteau'],
  ['Vigée Le Brun', 'Vigée'],
  ['Joshua Reynolds', 'Reynolds'],
  ['Giovanni Bellini', 'Bellini'],
  ['Caravaggio', 'Caravaggio'],
  ['Canaletto', 'Canaletto'],
  ['Giovanni Battista Tiepolo', 'Tiepolo'],
  ['Bartolomé Esteban Murillo', 'Murillo'],
  ['Jusepe de Ribera', 'Ribera'],
  ['Nicolas Lancret', 'Lancret'],
  ['Frederic Edwin Church', 'Church'],
  ['Jean-Baptiste Greuze', 'Greuze'],
];

const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const slugify = (s) =>
  norm(s)
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
  const detail = sum / Math.max(1, n);
  if (detail > 28) return 1;
  if (detail > 18) return 2;
  if (detail > 10) return 3;
  return 4;
}

async function pickForArtist(query, matchToken, usedIds) {
  const q = encodeURIComponent(query);
  const search = await getJson(`${MET}/search?hasImages=true&medium=Paintings&q=${q}`);
  const ids = (search.objectIDs || []).slice(0, 15);
  const token = norm(matchToken);
  for (const id of ids) {
    if (usedIds.has(id)) continue;
    let obj;
    try {
      obj = await getJson(`${MET}/objects/${id}`);
    } catch {
      continue;
    }
    if (!obj.isPublicDomain || !obj.primaryImage) continue;
    if (!norm(obj.artistDisplayName).includes(token)) continue;
    return obj;
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_IMG, { recursive: true });

  const { ARTWORKS_SEED: existing } = await import(
    `${pathToFileURL(EXISTING_JS).href}?t=${Date.now()}`
  );
  const catalogue = [...existing];
  const usedSlugs = new Set(existing.map((a) => a.id));
  const knownAuthors = new Set(existing.map((a) => norm(a.author)));
  console.log(`Catalogue existant : ${existing.length} œuvres.\n`);

  let added = 0;
  for (const [query, matchToken] of NEW_ARTISTS) {
    // Déjà couvert par un artiste présent ? (évite un doublon d'auteur)
    if ([...knownAuthors].some((a) => a.includes(norm(matchToken)))) {
      console.log(`• ${query} … déjà présent, ignoré`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 450)); // politesse (rate-limit Met)
    process.stdout.write(`• ${query} … `);
    let obj;
    try {
      obj = await pickForArtist(query, matchToken, new Set());
    } catch (e) {
      console.log('recherche KO', e.message);
      continue;
    }
    if (!obj) {
      console.log('aucune œuvre PD trouvée');
      continue;
    }
    let slug = slugify(obj.title) || slugify(query);
    while (usedSlugs.has(slug)) slug += '-2';

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

      usedSlugs.add(slug);
      knownAuthors.add(norm(obj.artistDisplayName));
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
      added++;
      console.log(`✓ ${slug} (${tw}×${th}, diff ${catalogue.at(-1).difficulty})`);
    } catch (e) {
      console.log('image KO', e.message);
    }
  }

  if (!added) {
    console.log('\nAucune nouvelle œuvre ajoutée.');
    return;
  }

  const header = `// Généré par scripts/prepare-artworks.mjs (+ ajouts scripts/add-artworks.mjs) — NE PAS ÉDITER À LA MAIN.
// Source : Metropolitan Museum of Art, Open Access (domaine public / CC0).
import type { Artwork } from '@mimic/shared';

export const ARTWORKS_SEED: Artwork[] = ${JSON.stringify(catalogue, null, 2)};
`;
  fs.writeFileSync(OUT_MANIFEST, header);
  console.log(`\n+${added} œuvres → ${catalogue.length} au total (${path.relative(ROOT, OUT_MANIFEST)})`);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
