// Smoke test du verrouillage + scoring (issue #12).
// 2 clients → partie → en camouflage, le caché verrouille un personnage dont les
// couleurs matchent le fond placeholder → score de camouflage attendu élevé.
// Usage: node scripts/smoke-lock.mjs   (serveur attendu sur PORT ou 3000)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { placeholderColorAt } from '../packages/shared/dist/index.js';

const clientPkg = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
const { io } = createRequire(clientPkg)('socket.io-client');

const S = 64;
const SERVER_URL = `http://localhost:${process.env.PORT ?? 3000}`;
const opts = { transports: ['websocket'], forceNew: true };
const host = io(SERVER_URL, opts);
const guest = io(SERVER_URL, opts);

const emit = (sock, ev, payload) =>
  new Promise((res) => (payload === undefined ? sock.emit(ev, res) : sock.emit(ev, payload, res)));
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};

host.on('session', (d) => (host.pid = d.playerId));
guest.on('session', (d) => (guest.pid = d.playerId));

let locked = false;
const onSnap = (sock) => (snap) => {
  if (snap.phase !== 'camouflage' || locked) return;
  if (snap.seekerId === sock.pid) return; // ce client est le chercheur
  locked = true;
  const art = snap.artwork;
  const x = Math.round((art.width - S) / 2);
  const y = Math.round((art.height - S) / 2);
  // Personnage dont chaque pixel matche exactement le fond sous lui.
  const pixels = new Array(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const [r, g, b] = placeholderColorAt(art.id, art.width, art.height, x + i, y + j);
      const idx = (j * S + i) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = 255;
    }
  }
  emit(sock, 'character:lock', { placement: { x, y, rotation: 0 }, pixels }).then((res) => {
    if (!res.ok) fail(`lock refusé: ${res.error}`);
    const b = res.breakdown;
    console.log('✓ lock OK, breakdown =', b);
    if (typeof b.score !== 'number' || b.score < 0 || b.score > 100) fail('score hors bornes');
    if (b.score < 90) fail(`score trop bas pour un match parfait: ${b.score}`);
    console.log('✓ score cohérent (match parfait ≈ 100%)');
    host.close();
    guest.close();
    process.exit(0);
  });
};

host.on('room:snapshot', onSnap(host));
guest.on('room:snapshot', onSnap(guest));

const run = async () => {
  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => guest.on('connect', r));
  const created = await emit(host, 'room:create', { mode: 'classic' });
  if (!created.ok) fail('création');
  const joined = await emit(guest, 'room:join', { code: created.code });
  if (!joined.ok) fail('join');
  const started = await emit(host, 'room:start');
  if (!started.ok) fail(`start: ${started.error}`);
  setTimeout(() => !locked && fail('pas de phase camouflage reçue'), 4000);
};
run();
