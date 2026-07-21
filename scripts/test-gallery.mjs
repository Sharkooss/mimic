// Test e2e de la galerie personnelle (#25) contre une instance AVEC base.
// Deux comptes jouent un match blitz complet ; on vérifie que chacun reçoit
// l'événement gallery:unlocked et que /api/me/gallery se remplit des œuvres jouées.
// Usage : BASE=https://mimic.louis-nectoux.fr node scripts/test-gallery.mjs
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const BASE = process.env.BASE ?? 'https://mimic.louis-nectoux.fr';
const WS = BASE.replace(/^http/, 'ws');
const S = 96;

const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
setTimeout(() => fail('Timeout global (180s).'), 180_000);

const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
};

const register = (n) =>
  post('/api/auth/register', {
    email: `gtest_${n}_${Date.now()}@example.com`,
    pseudo: `Gtest${n}${String(Date.now()).slice(-4)}`,
    password: 'motdepasse123',
  });

const connect = (userToken) =>
  new Promise((res, rej) => {
    const s = io(BASE, {
      transports: ['websocket'],
      path: '/socket.io',
      auth: { token: 'gal-' + Math.random().toString(36).slice(2), userToken },
    });
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
    void WS;
  });

const redChar = () => {
  const px = new Array(S * S * 4).fill(0);
  for (let i = 0; i < S * S; i++) {
    px[i * 4] = 220;
    px[i * 4 + 3] = 255;
  }
  return px;
};

// Chaque bot joue tout seul : caché → verrouille au centre ; chercheur → clique
// la cible reçue (position exacte) pour la trouver → fin de manche anticipée.
function autoplay(sock, ids, label) {
  const unlocked = [];
  sock.on('gallery:unlocked', (d) => unlocked.push(...d.artworks.map((a) => a.id)));
  sock.on('seeking:targets', (targets) => {
    for (const t of targets) {
      sock.emit('seeker:click', { x: t.x + S / 2, y: t.y + S / 2 }, () => {});
    }
  });
  sock.on('room:snapshot', (snap) => {
    if (snap.phase !== 'camouflage' || snap.seekerId === ids[label]) return;
    const art = snap.artwork;
    if (!art) return;
    const x = Math.round((art.width - S) / 2);
    const y = Math.round((art.height - S) / 2);
    sock.emit('character:lock', { placement: { x, y, rotation: 0 }, pixels: redChar() }, () => {});
  });
  return unlocked;
}

const A = await register('A');
const B = await register('B');
console.log('Comptes créés :', A.user.pseudo, '/', B.user.pseudo);

const sa = await connect(A.token);
const sb = await connect(B.token);
const ids = {};
sa.on('session', (d) => (ids.A = d.playerId));
sb.on('session', (d) => (ids.B = d.playerId));
await new Promise((r) => setTimeout(r, 300));

const unlockedA = autoplay(sa, ids, 'A');
const unlockedB = autoplay(sb, ids, 'B');

const code = await new Promise((res) =>
  sa.emit('room:create', { mode: 'blitz', visibility: 'private' }, (r) =>
    r.ok ? res(r.code) : fail('create: ' + r.error),
  ),
);
await new Promise((res) =>
  sb.emit('room:join', { code }, (r) => (r.ok ? res() : fail('join: ' + r.error))),
);
console.log('Salon blitz', code, '— partie en cours (peut durer ~1 min)…');

const finished = new Promise((res) => {
  const on = (phase) => {
    if (phase === 'finished') {
      sa.off('phase:changed', on);
      res();
    }
  };
  sa.on('phase:changed', on);
});
await new Promise((res) => sa.emit('room:start', (r) => (r.ok ? res() : fail('start: ' + r.error))));
await finished;
console.log('Partie terminée. Déblocages reçus — A:', unlockedA.length, 'B:', unlockedB.length);

// Laisse la persistance s'écrire, puis interroge les galeries.
await new Promise((r) => setTimeout(r, 1500));
const gallery = async (token) => {
  const r = await fetch(BASE + '/api/me/gallery', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`gallery HTTP ${r.status}`);
  return r.json();
};
const ga = await gallery(A.token);
const gb = await gallery(B.token);
console.log(`Galerie A : ${ga.collected.length}/${ga.total} · Galerie B : ${gb.collected.length}/${gb.total}`);

if (ga.collected.length < 1 || gb.collected.length < 1) {
  fail('la galerie devrait contenir au moins 1 œuvre après une partie');
}
if (unlockedA.length < 1 || unlockedB.length < 1) {
  fail('chaque joueur aurait dû recevoir au moins un déblocage (gallery:unlocked)');
}
if (ga.total < 55) fail(`total du catalogue inattendu: ${ga.total}`);

console.log('\n✅ Galerie personnelle : œuvres collectées + notification de déblocage OK');
process.exit(0);
