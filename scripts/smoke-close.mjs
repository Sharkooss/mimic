// Smoke test de la fermeture de salon : (1) fermeture manuelle par l'hôte, (2)
// expiration automatique après inactivité, (3) l'activité (join) repousse
// l'expiration. À lancer contre un serveur local dont ROOM_INACTIVITY_MS est
// court (ex. 1500). Usage : BASE=http://localhost:3000 node scripts/smoke-close.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EVENTS } from '../packages/shared/dist/index.js';
const req = createRequire(fileURLToPath(new URL('../apps/client/package.json', import.meta.url)));
const { io } = req('socket.io-client');

const BASE = process.env.BASE ?? 'http://localhost:3000';
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name) {
  const sock = io(BASE, { forceNew: true, auth: { token: 'rt-' + name + Math.random() } });
  const bot = { name, sock, closed: null };
  sock.on(EVENTS.roomClosed, (reason) => (bot.closed = reason));
  sock.on('connect_error', (e) => fail('connect_error ' + e.message));
  return bot;
}
const emit = (sock, ...args) => new Promise((r) => sock.emit(...args, r));

async function main() {
  const a = connect('A');
  const b = connect('B');
  const c = connect('C');
  await Promise.all(['A', 'B', 'C'].map((_, i) => new Promise((r) => [a, b, c][i].sock.on('connect', r))));
  await wait(200);

  // ── 1. Fermeture manuelle par l'hôte ──────────────────────────────────────
  const room1 = await emit(a.sock, EVENTS.roomCreate, { mode: 'classic' });
  if (!room1.ok) fail('create KO');
  const join1 = await emit(b.sock, EVENTS.roomJoin, { code: room1.code });
  if (!join1.ok) fail('join KO');
  // Un non-hôte ne peut pas fermer.
  const forbidden = await emit(b.sock, EVENTS.roomClose);
  if (forbidden.ok) fail('un non-hôte a pu fermer le salon (interdit)');
  ok('non-hôte : fermeture refusée');
  const closeRes = await emit(a.sock, EVENTS.roomClose);
  if (!closeRes.ok) fail('close KO ' + closeRes.error);
  await wait(150);
  if (!a.closed || !b.closed) fail('room:closed non reçu par tous (hôte manuel)');
  ok(`fermeture manuelle : A et B éjectés (« ${b.closed} »)`);
  // Le salon n'existe plus : rejoindre par code échoue.
  const rejoin = await emit(c.sock, EVENTS.roomJoin, { code: room1.code });
  if (rejoin.ok) fail('le salon fermé est encore rejoignable');
  ok('salon fermé : plus rejoignable par code');

  // ── 2. Expiration automatique par inactivité ──────────────────────────────
  a.closed = null;
  const room2 = await emit(a.sock, EVENTS.roomCreate, { mode: 'classic' });
  if (!room2.ok) fail('create #2 KO');
  ok(`salon ${room2.code} créé, on attend l'expiration (aucune activité)…`);
  await wait(2500); // > ROOM_INACTIVITY_MS de test (1500)
  if (!a.closed) fail("le salon inactif ne s'est pas fermé");
  if (!/activit/i.test(a.closed)) fail('mauvais motif de fermeture : ' + a.closed);
  ok(`expiration auto : salon fermé (« ${a.closed} »)`);

  // ── 3. Une activité (join) repousse l'expiration ──────────────────────────
  a.closed = null;
  b.closed = null;
  const room3 = await emit(a.sock, EVENTS.roomCreate, { mode: 'classic' });
  if (!room3.ok) fail('create #3 KO');
  await wait(1000); // avant l'échéance (1500)
  const join3 = await emit(b.sock, EVENTS.roomJoin, { code: room3.code }); // réarme l'horloge
  if (!join3.ok) fail('join #3 KO');
  await wait(1000); // 2 s depuis la création, mais < 1500 depuis le join → toujours ouvert
  if (a.closed) fail("le salon s'est fermé malgré une activité récente (join)");
  ok('activité (join) : expiration repoussée, salon toujours ouvert');
  await wait(1200); // > 1500 depuis le join, plus d'activité → doit fermer
  if (!a.closed || !b.closed) fail("le salon ne s'est pas fermé après la nouvelle période d'inactivité");
  ok('après la nouvelle période sans activité : salon fermé');

  console.log('✅ smoke close OK');
  process.exit(0);
}

main().catch((e) => fail(e.message));
setTimeout(() => fail('timeout global'), 30000);
