// Smoke test de la boucle de manche (issue #7).
// Lance 2 clients, crée un salon, rejoint, démarre, et vérifie la 1re transition.
// Usage: node scripts/smoke-match.mjs  (serveur attendu sur PORT ou 3000)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// socket.io-client est une dépendance du client : on le résout depuis apps/client.
const clientPkg = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
const { io } = createRequire(clientPkg)('socket.io-client');

const SERVER_URL = `http://localhost:${process.env.PORT ?? 3000}`;
const opts = { transports: ['websocket'], forceNew: true };

const host = io(SERVER_URL, opts);
const guest = io(SERVER_URL, opts);

const emit = (sock, ev, payload) =>
  new Promise((res) => (payload === undefined ? sock.emit(ev, res) : sock.emit(ev, payload, res)));

const fail = (msg) => {
  console.error('❌', msg);
  process.exit(1);
};

let ok = false;
host.on('room:snapshot', (snap) => {
  if (snap.phase === 'camouflage') {
    const checks = [
      [snap.artwork != null, 'artwork présent'],
      [snap.seekerId != null, 'chercheur désigné'],
      [snap.totalRounds === 2, 'totalRounds = 2'],
      [snap.phaseEndsAt != null, 'phaseEndsAt défini'],
    ];
    for (const [cond, label] of checks) if (!cond) fail(`échec: ${label}`);
    console.log('✓ transition camouflage OK', {
      artwork: snap.artwork.title,
      seeker: snap.seekerId.slice(0, 6),
      rounds: snap.totalRounds,
    });
    ok = true;
    host.close();
    guest.close();
    process.exit(0);
  }
});

const run = async () => {
  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => guest.on('connect', r));
  const created = await emit(host, 'room:create', { mode: 'classic' });
  if (!created.ok) fail('création salon');
  const joined = await emit(guest, 'room:join', { code: created.code });
  if (!joined.ok) fail('join salon');
  const started = await emit(host, 'room:start');
  if (!started.ok) fail(`start: ${started.error}`);
  console.log('→ partie démarrée, salon', created.code);
  setTimeout(() => !ok && fail('pas de transition camouflage reçue (timeout)'), 4000);
};

run();
