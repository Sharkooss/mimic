// Test du relais temps réel du curseur du chercheur (seeker:cursor).
// 2 joueurs → partie → en phase seeking, le chercheur émet sa position ;
// l'autre joueur doit la recevoir. Vérifie aussi qu'un non-chercheur ne peut
// pas usurper l'émission (le serveur ignore).
// Usage : node scripts/test-cursor.mjs [port]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const PORT = process.argv[2] ?? '3000';
const URL_ = `http://localhost:${PORT}`;

const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
setTimeout(() => fail('Timeout (120s).'), 120_000);

const connect = (token) =>
  new Promise((res, rej) => {
    const s = io(URL_, { auth: { token }, transports: ['websocket'] });
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });

const A = await connect('cursor-A-' + Date.now());
const B = await connect('cursor-B-' + Date.now());
const ids = {};
A.on('session', (d) => (ids.A = d.playerId));
B.on('session', (d) => (ids.B = d.playerId));

const code = await new Promise((res) =>
  A.emit('room:create', { mode: 'classic', visibility: 'private' }, (r) =>
    r.ok ? res(r.code) : fail('create: ' + r.error),
  ),
);
await new Promise((res) =>
  B.emit('room:join', { code }, (r) => (r.ok ? res() : fail('join: ' + r.error))),
);

// Raccourcit les phases pour un test rapide (min autorisé).
await new Promise((res) =>
  A.emit('room:set-settings', { camouflageSec: 15, seekingSec: 30 }, (r) =>
    r.ok ? res() : fail('set-settings: ' + r.error),
  ),
);

const seekingSnap = new Promise((res) => {
  const onSnap = (snap) => {
    if (snap.phase === 'seeking' && snap.seekerId) {
      A.off('room:snapshot', onSnap);
      res(snap);
    }
  };
  A.on('room:snapshot', onSnap);
});
await new Promise((res) => A.emit('room:start', (r) => (r.ok ? res() : fail('start: ' + r.error))));
console.log('Partie lancée, attente de la phase seeking (~15 s)…');
const snap = await seekingSnap;

const seeker = snap.seekerId === ids.A ? A : B;
const watcher = seeker === A ? B : A;
console.log('Phase seeking. Chercheur =', snap.seekerId === ids.A ? 'A' : 'B');

// 1) Le chercheur émet → le watcher reçoit la position.
const got = new Promise((res) => watcher.once('seeker:cursor', res));
seeker.emit('seeker:cursor', { x: 123.5, y: 77.25 });
const pos = await got;
if (Math.abs(pos.x - 123.5) > 0.001 || Math.abs(pos.y - 77.25) > 0.001) {
  fail('position relayée incorrecte: ' + JSON.stringify(pos));
}
console.log('✓ Le curseur du chercheur est relayé au watcher.', pos);

// 2) Le chercheur ne se le renvoie PAS à lui-même (socket.to exclut l'émetteur).
let selfEcho = false;
seeker.once('seeker:cursor', () => (selfEcho = true));
seeker.emit('seeker:cursor', { x: 5, y: 5 });

// 3) Un non-chercheur qui tente d'émettre est ignoré (le seeker ne reçoit rien).
let usurped = false;
seeker.once('seeker:cursor', () => (usurped = true));
watcher.emit('seeker:cursor', { x: 9, y: 9 });

await new Promise((r) => setTimeout(r, 400));
if (selfEcho) fail('le chercheur ne devrait pas recevoir son propre curseur');
if (usurped) fail('un non-chercheur ne devrait pas pouvoir émettre le curseur');
console.log('✓ Pas d’écho vers le chercheur, usurpation par un caché ignorée.');

console.log('\n✅ Relais du curseur du chercheur : OK');
process.exit(0);
