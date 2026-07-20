// Smoke test visibilité par rôle + reconnexion (issue #16).
//  - Aucune position de joueur ne fuit dans les snapshots (clés PublicPlayer only).
//  - Reconnexion par token : nouveau socket, même token → même id public + resync.
//  - Le pair voit connected passer à false (grâce) puis true (reconnexion).
// Usage: node scripts/smoke-reconnect.mjs  (serveur attendu sur PORT ou 3000)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const clientPkg = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
const { io } = createRequire(clientPkg)('socket.io-client');

const URL_ = `http://localhost:${process.env.PORT ?? 3000}`;
const conn = (token) => io(URL_, { transports: ['websocket'], forceNew: true, auth: { token } });
const emit = (s, ev, p) =>
  new Promise((r) => (p === undefined ? s.emit(ev, r) : s.emit(ev, p, r)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);

const ALLOWED = new Set(['id', 'pseudo', 'level', 'connected', 'isHost', 'score']);

const HOST_TOKEN = 'host-tok-' + Date.now();
const GUEST_TOKEN = 'guest-tok-' + Date.now();

const run = async () => {
  const host = conn(HOST_TOKEN);
  const guest = conn(GUEST_TOKEN);
  let hostPid = null;
  let guestSnap = null;
  host.on('session', (d) => (hostPid = d.playerId));
  guest.on('room:snapshot', (s) => (guestSnap = s));

  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => guest.on('connect', r));

  const created = await emit(host, 'room:create', { mode: 'classic' });
  if (!created.ok) fail('création');
  const code = created.code;
  const joined = await emit(guest, 'room:join', { code });
  if (!joined.ok) fail('join');
  await sleep(300);

  if (!hostPid) fail('pas de session/playerId reçu');
  if (hostPid === host.id) fail('id public ne doit pas être le socket.id');
  ok(`session reçue, id public stable (${hostPid.slice(0, 8)}…) ≠ socket.id`);

  // Aucune fuite : les joueurs des snapshots n'exposent que des clés publiques.
  if (!guestSnap) fail('pas de snapshot');
  for (const p of guestSnap.players) {
    const extra = Object.keys(p).filter((k) => !ALLOWED.has(k));
    if (extra.length) fail(`fuite de champ dans le snapshot: ${extra.join(', ')}`);
  }
  ok('snapshots sans fuite de position (clés PublicPlayer uniquement)');

  // Reconnexion : le pair voit host déconnecté, puis reconnecté.
  const savedPid = hostPid;
  host.close();
  await sleep(600);
  const hostEntry = () => guestSnap?.players.find((p) => p.id === savedPid);
  if (!hostEntry()) fail('host retiré immédiatement (pas de grâce)');
  if (hostEntry().connected !== false) fail('host devrait être connected=false pendant la grâce');
  ok('déconnexion → host en grâce (connected=false), toujours présent');

  const host2 = conn(HOST_TOKEN);
  let host2Pid = null;
  let host2Snap = null;
  host2.on('session', (d) => (host2Pid = d.playerId));
  host2.on('room:snapshot', (s) => (host2Snap = s));
  await new Promise((r) => host2.on('connect', r));
  await sleep(400);

  if (host2Pid !== savedPid) fail(`reconnexion: id changé (${host2Pid} ≠ ${savedPid})`);
  ok('reconnexion (même token) → même id public');
  if (!host2Snap || host2Snap.code !== code) fail('reconnexion: snapshot du salon non resynchronisé');
  ok('reconnexion → snapshot du salon resynchronisé');
  if (!hostEntry() || hostEntry().connected !== true) fail('host devrait repasser connected=true');
  ok('le pair voit host reconnecté (connected=true)');

  host2.close();
  guest.close();
  console.log('✅ smoke reconnect OK');
  process.exit(0);
};

setTimeout(() => fail('timeout global'), 12000);
run();
