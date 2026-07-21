// Test du partage des co-cachés pendant la recherche (seeking:cohiders).
// 3 joueurs → 1 chercheur + 2 cachés. Chaque caché doit recevoir la liste des
// cachés (soi + l'autre, avec pseudo) ; le chercheur ne reçoit RIEN.
// Usage : node scripts/test-cohiders.mjs [port]   (serveur lancé)
import { createRequire } from 'node:module';
import { CHARACTER_SIZE } from '../packages/shared/dist/index.js';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const PORT = process.argv[2] ?? '3000';
const URL_ = `http://localhost:${PORT}`;
const S = CHARACTER_SIZE;

const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
setTimeout(() => fail('Timeout (60s).'), 60_000);

const connect = (token) =>
  new Promise((res, rej) => {
    const s = io(URL_, { auth: { token }, transports: ['websocket'] });
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });

const redChar = () => {
  const px = new Array(S * S * 4).fill(0);
  for (let i = 0; i < S * S; i++) {
    px[i * 4] = 220;
    px[i * 4 + 3] = 255;
  }
  return px;
};

const socks = [];
for (let i = 0; i < 3; i++) socks.push(await connect('coh-' + i + '-' + Date.now()));
const [host, ...rest] = socks;
const ids = {};
socks.forEach((s, i) => s.on('session', (d) => (ids[i] = d.playerId)));
// Chaque socket mémorise les cohiders reçus.
const received = socks.map(() => null);
socks.forEach((s, i) => s.on('seeking:cohiders', (h) => (received[i] = h)));

const code = await new Promise((res) =>
  host.emit('room:create', { mode: 'classic', visibility: 'private' }, (r) =>
    r.ok ? res(r.code) : fail('create: ' + r.error),
  ),
);
for (const s of rest) {
  await new Promise((res) =>
    s.emit('room:join', { code }, (r) => (r.ok ? res() : fail('join: ' + r.error))),
  );
}
await new Promise((r) => setTimeout(r, 200));

// Au début du camouflage on connaît le chercheur ; les 2 cachés verrouillent.
const camoSnap = new Promise((res) => {
  const on = (snap) => {
    if (snap.phase === 'camouflage' && snap.seekerId) {
      host.off('room:snapshot', on);
      res(snap);
    }
  };
  host.on('room:snapshot', on);
});
await new Promise((res) => host.emit('room:start', (r) => (r.ok ? res() : fail('start: ' + r.error))));
const snap = await camoSnap;
const seekerIdx = socks.findIndex((_, i) => ids[i] === snap.seekerId);
console.log('Chercheur = joueur', seekerIdx);

let px0 = 40;
socks.forEach((s, i) => {
  if (i === seekerIdx) return;
  s.emit('character:lock', { placement: { x: px0, y: 60, rotation: 0 }, pixels: redChar() }, () => {});
  px0 += 200;
});

// Attend la phase de recherche (fin du camouflage) + réception des cohiders.
await new Promise((res) => {
  const on = (phase) => {
    if (phase === 'seeking') {
      host.off('phase:changed', on);
      res();
    }
  };
  host.on('phase:changed', on);
});
await new Promise((r) => setTimeout(r, 400));

const hiderIdxs = [0, 1, 2].filter((i) => i !== seekerIdx);
for (const i of hiderIdxs) {
  const h = received[i];
  if (!Array.isArray(h)) fail(`le caché ${i} n'a pas reçu seeking:cohiders`);
  if (h.length !== 2) fail(`le caché ${i} devrait voir 2 cachés, reçu ${h.length}`);
  if (!h.every((c) => typeof c.pseudo === 'string' && c.pixels && Number.isFinite(c.x)))
    fail(`cohiders du joueur ${i} mal formés`);
  const seesSelf = h.some((c) => c.id === ids[i]);
  if (!seesSelf) fail(`le caché ${i} devrait se voir lui-même dans la liste`);
}
console.log('✓ Chaque caché voit les 2 cachés (soi + l\'autre), avec pseudo et pixels.');

if (received[seekerIdx] !== null) fail('le chercheur ne devrait PAS recevoir les co-cachés');
console.log('✓ Le chercheur ne reçoit pas les co-cachés.');

console.log('\n✅ Partage des co-cachés pendant la recherche : OK');
process.exit(0);
