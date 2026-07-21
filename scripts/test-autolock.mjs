// Test e2e du verrouillage automatique de fin de camouflage (refonte UX).
// Scénario : 2 joueurs, le caché peint (présence relayée) mais ne verrouille
// JAMAIS manuellement. À la fin du chrono, le serveur doit auto-verrouiller :
// le chercheur reçoit la cible, peut la trouver, et les résultats portent un
// score de camouflage.
// Usage : serveur lancé (PORT=3999 par défaut), puis
//   node scripts/test-autolock.mjs [port]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const PORT = process.argv[2] ?? '3999';
const URL_ = `http://localhost:${PORT}`;
const S = 64;

const fail = (msg) => {
  console.error('❌', msg);
  process.exit(1);
};
setTimeout(() => fail('Timeout global (150s).'), 150_000);

const connect = (token) =>
  new Promise((res, rej) => {
    const s = io(URL_, { auth: { token }, transports: ['websocket'] });
    s.once('connect', () => res(s));
    s.once('connect_error', rej);
  });

const greenPixels = () => {
  const px = new Array(S * S * 4).fill(0);
  for (let i = 0; i < S * S; i++) {
    px[i * 4] = 34;
    px[i * 4 + 1] = 197;
    px[i * 4 + 2] = 94;
    px[i * 4 + 3] = 255;
  }
  return px;
};

const A = await connect('autolock-test-A-' + Date.now());
const B = await connect('autolock-test-B-' + Date.now());

const ids = {};
A.on('session', (d) => (ids.A = d.playerId));
B.on('session', (d) => (ids.B = d.playerId));

const code = await new Promise((res) =>
  A.emit('room:create', { mode: 'classic', visibility: 'private' }, (r) =>
    r.ok ? res(r.code) : fail('create: ' + r.error),
  ),
);
console.log('Salon', code);

await new Promise((res) =>
  B.emit('room:join', { code }, (r) => (r.ok ? res() : fail('join: ' + r.error))),
);

// Démarre et attend la phase camouflage pour connaître le chercheur.
const snapshotCamouflage = new Promise((res) => {
  const onSnap = (snap) => {
    if (snap.phase === 'camouflage' && snap.seekerId) {
      A.off('room:snapshot', onSnap);
      res(snap);
    }
  };
  A.on('room:snapshot', onSnap);
});
await new Promise((res) => A.emit('room:start', (r) => (r.ok ? res() : fail('start: ' + r.error))));
const snap = await snapshotCamouflage;

const seekerSock = snap.seekerId === ids.A ? A : B;
const hiderSock = seekerSock === A ? B : A;
console.log('Phase camouflage. Chercheur =', snap.seekerId === ids.A ? 'A' : 'B');

// Le caché signale sa présence (comme le fait le client au chargement / à chaque
// coup de pinceau) puis NE VERROUILLE PAS. Fin de chrono dans ~40s.
hiderSock.emit('presence:update', { x: 10, y: 10, rotation: 0, pixels: greenPixels() });
console.log('Présence envoyée (x=10, y=10, vert). Attente de la fin du camouflage…');

const targets = await new Promise((res) => seekerSock.once('seeking:targets', res));
if (targets.length !== 1) fail(`seeking:targets — attendu 1 cible, reçu ${targets.length}`);
const t = targets[0];
if (t.x !== 10 || t.y !== 10) fail(`cible mal placée: (${t.x}, ${t.y})`);
if (t.pixels[0] !== 34 || t.pixels[1] !== 197 || t.pixels[2] !== 94)
  fail('pixels de la cible incorrects');
console.log('✓ Le chercheur reçoit le caché auto-verrouillé (position + pixels corrects).');

// Le chercheur clique au centre du perso → doit être un hit. L'écouteur des
// résultats est attaché AVANT le clic (le serveur les émet dans la foulée).
const resultsPromise = new Promise((res) => seekerSock.once('round:results', res));
const click = await new Promise((res) =>
  seekerSock.emit('seeker:click', { x: t.x + S / 2, y: t.y + S / 2 }, res),
);
if (!click.ok || !click.hit) fail('le clic du chercheur aurait dû toucher: ' + JSON.stringify(click));
console.log('✓ Clic du chercheur = touché.');

const results = await resultsPromise;
const reveal = results.reveals.find((r) => r.playerId === t.id);
if (!reveal) fail('le caché manque dans les révélations de fin de manche');
if (reveal.camouflageScore == null) fail('camouflageScore absent (auto-lock sans score)');
console.log(`✓ Résultats : caché révélé, trouvé=${reveal.found}, camouflage=${reveal.camouflageScore}%.`);

console.log('\n✅ Auto-verrouillage de fin de camouflage : OK');
process.exit(0);
