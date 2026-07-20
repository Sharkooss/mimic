// Génère le PNG du personnage (silhouette 64×64, blanc opaque sur transparent).
// L'alpha définit la zone peignable. Remplaçable par un vrai asset plus tard.
// Usage: node scripts/gen-character.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SIZE = 64;

// --- Silhouette procédurale (type Among Us) --------------------------------
function inside(x, y) {
  const cx = 29;
  // Corps : disque supérieur arrondi + rectangle.
  const topCircle = (x - cx) ** 2 + (y - 23) ** 2 <= 14 ** 2 && y <= 23;
  const bodyRect = x >= cx - 14 && x <= cx + 14 && y >= 23 && y <= 52;
  let body = topCircle || bodyRect;

  // Sac à dos (droite).
  const backpack = x >= cx + 13 && x <= cx + 21 && y >= 29 && y <= 46;
  body = body || backpack;

  if (!body) return false;

  // Entrejambe : encoche pour séparer les deux jambes.
  const legNotch = x >= cx - 4 && x <= cx + 4 && y >= 47 && y <= 52;
  if (legNotch) return false;

  return true;
}

// --- Buffer RGBA -----------------------------------------------------------
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4)); // +1 octet de filtre par ligne
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filtre "None"
  for (let x = 0; x < SIZE; x++) {
    const on = inside(x, y);
    raw[p++] = 255; // R
    raw[p++] = 255; // G
    raw[p++] = 255; // B
    raw[p++] = on ? 255 : 0; // A
  }
}

// --- Encodage PNG ----------------------------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = 'apps/client/public/character.png';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`✓ ${out} (${SIZE}×${SIZE}, ${png.length} octets)`);
