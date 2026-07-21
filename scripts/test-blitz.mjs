// Test du mode Blitz (#28) : durées preset appliquées au changement de mode,
// plafond de manches (3), et refus des modes non implémentés.
// Usage : node scripts/test-blitz.mjs [port]   (serveur lancé)
import { createRequire } from 'node:module';
import { MODE_META } from '../packages/shared/dist/index.js';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const PORT = process.argv[2] ?? '3000';
const URL_ = `http://localhost:${PORT}`;

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

const snapOnce = (sock, pred) =>
  new Promise((res) => {
    const on = (snap) => {
      if (pred(snap)) {
        sock.off('room:snapshot', on);
        res(snap);
      }
    };
    sock.on('room:snapshot', on);
  });

// 4 joueurs : en classique la partie ferait 4 manches ; Blitz doit plafonner à 3.
const socks = [];
for (let i = 0; i < 4; i++) socks.push(await connect('blitz-' + i + '-' + Date.now()));
const [host, ...rest] = socks;

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

// 1) Passage en Blitz → les durées preset sont appliquées dans le snapshot.
const blitzSnap = snapOnce(host, (s) => s.mode === 'blitz');
await new Promise((res) =>
  host.emit('room:set-mode', { mode: 'blitz' }, (r) => (r.ok ? res() : fail('set-mode: ' + r.error))),
);
const snap = await blitzSnap;
if (snap.settings.camouflageSec !== MODE_META.blitz.durations.camouflageSec) {
  fail(`Blitz: camouflageSec attendu ${MODE_META.blitz.durations.camouflageSec}, reçu ${snap.settings.camouflageSec}`);
}
if (snap.settings.seekingSec !== MODE_META.blitz.durations.seekingSec) {
  fail(`Blitz: seekingSec attendu ${MODE_META.blitz.durations.seekingSec}, reçu ${snap.settings.seekingSec}`);
}
console.log('✓ Passer en Blitz applique les durées preset', snap.settings);

// 2) Un mode non implémenté est refusé.
const rejected = await new Promise((res) =>
  host.emit('room:set-mode', { mode: 'ranked' }, (r) => res(r)),
);
if (rejected.ok) fail('le mode ranked (non implémenté) aurait dû être refusé');
console.log('✓ Mode non implémenté refusé :', rejected.error);

// 3) Lancement : Blitz plafonne à 3 manches (4 joueurs → 3, pas 4).
const started = snapOnce(host, (s) => s.phase !== 'lobby' && s.totalRounds > 0);
await new Promise((res) => host.emit('room:start', (r) => (r.ok ? res() : fail('start: ' + r.error))));
const s2 = await started;
if (s2.totalRounds !== 3) fail(`Blitz: totalRounds attendu 3 (plafond), reçu ${s2.totalRounds}`);
console.log(`✓ Blitz plafonne la partie à ${s2.totalRounds} manches (4 joueurs).`);

console.log('\n✅ Mode Blitz : OK');
process.exit(0);
