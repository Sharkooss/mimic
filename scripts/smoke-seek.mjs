// Smoke test de la vue chercheur (issue #13).
// 2 clients → partie. Le caché verrouille au centre. En phase de recherche :
//  - un clic loin de la cible → raté (hit:false) + cooldown ;
//  - un clic immédiat pendant le cooldown → refusé ;
//  - après le cooldown, un clic sur la cible → touché (hit:true) ;
//  - un événement player:found est diffusé (placement + pixels) ;
//  - tous les cachés trouvés → la recherche se termine en avance (results).
// Usage: node scripts/smoke-seek.mjs   (serveur attendu sur PORT ou 3000)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { CHARACTER_SIZE } from '../packages/shared/dist/index.js';

const clientPkg = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
const { io } = createRequire(clientPkg)('socket.io-client');

const S = CHARACTER_SIZE;
const SERVER_URL = `http://localhost:${process.env.PORT ?? 3000}`;
const opts = { transports: ['websocket'], forceNew: true };
const a = io(SERVER_URL, opts);
const b = io(SERVER_URL, opts);

const emit = (sock, ev, payload) =>
  new Promise((res) => (payload === undefined ? sock.emit(ev, res) : sock.emit(ev, payload, res)));
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);
a.on('session', (d) => (a.pid = d.playerId));
b.on('session', (d) => (b.pid = d.playerId));
const sockById = (id) => (a.pid === id ? a : b.pid === id ? b : null);

let placement = null;
let hiderId = null;
let seekerSock = null;
let didLock = false;
let didSeek = false;
let foundEvent = null;
let done = false;

a.on('player:found', (d) => (foundEvent = d));
b.on('player:found', (d) => (foundEvent = d));
let roundResults = null;
a.on('round:results', (d) => (roundResults = d));
b.on('round:results', (d) => (roundResults = d));
let targets = null;
a.on('seeking:targets', (t) => (targets = t));
b.on('seeking:targets', (t) => (targets = t));

async function onCamouflage(snap) {
  if (didLock) return;
  didLock = true;
  seekerSock = sockById(snap.seekerId);
  const hiderSock = seekerSock === a ? b : a;
  hiderId = hiderSock.pid;
  const art = snap.artwork;
  const x = Math.round((art.width - S) / 2);
  const y = Math.round((art.height - S) / 2);
  placement = { x, y, cx: x + S / 2, cy: y + S / 2 };
  const pixels = new Array(S * S * 4);
  for (let k = 0; k < pixels.length; k++) pixels[k] = k % 4 === 3 ? 255 : 120;
  const res = await emit(hiderSock, 'character:lock', { placement: { x, y, rotation: 0 }, pixels });
  if (!res.ok) fail(`lock refusé: ${res.error}`);
  ok(`caché verrouillé au centre (${x},${y}) — attente de la phase de recherche (~40s)`);
}

async function onSeeking() {
  if (didSeek) return;
  didSeek = true;

  // Le chercheur doit RECEVOIR les cachés camouflés à afficher (sinon injouable).
  await new Promise((r) => setTimeout(r, 300));
  if (!targets || targets.length !== 1) fail(`seeking:targets attendu (1 caché), reçu ${JSON.stringify(targets)}`);
  const t = targets[0];
  if (t.id !== hiderId) fail('la cible ne correspond pas au caché');
  if (!Array.isArray(t.pixels) || t.pixels.length !== S * S * 4) fail('cible: pixels manquants');
  if (t.x !== placement.x || t.y !== placement.y) fail('cible: position incorrecte');
  ok(`chercheur reçoit la cible camouflée (id, position ${t.x},${t.y}, pixels) — repérable`);
  // Le chercheur clique la position REÇUE (comme s'il l'avait repérée).
  placement.cx = t.x + S / 2;
  placement.cy = t.y + S / 2;

  const miss = await emit(seekerSock, 'seeker:click', { x: 4, y: 4 });
  if (!miss.ok) fail(`ack raté: ${miss.error}`);
  if (miss.hit !== false) fail('un clic loin de la cible devrait rater');
  ok('clic loin de la cible → hit:false');

  const during = await emit(seekerSock, 'seeker:click', { x: placement.cx, y: placement.cy });
  if (during.ok !== false) fail('un clic pendant le cooldown devrait être refusé');
  ok(`clic pendant le cooldown → refusé (${during.error})`);

  await new Promise((r) => setTimeout(r, 3200));

  const hit = await emit(seekerSock, 'seeker:click', { x: placement.cx, y: placement.cy });
  if (!hit.ok) fail(`ack touché: ${hit.error}`);
  if (hit.hit !== true) fail('un clic sur la cible devrait toucher');
  if (hit.playerId !== hiderId) fail('playerId du touché incorrect');
  ok('clic sur la cible → hit:true, playerId correct');
}

function onResults() {
  if (done) return;
  done = true;
  if (!foundEvent) fail('aucun player:found reçu');
  if (foundEvent.playerId !== hiderId) fail('reveal: playerId incorrect');
  if (!foundEvent.placement || foundEvent.placement.x !== placement.x) fail('reveal: placement incorrect');
  if (!Array.isArray(foundEvent.pixels) || foundEvent.pixels.length !== S * S * 4)
    fail('reveal: pixels incorrects');
  ok('player:found diffusé avec placement + pixels');

  if (!roundResults) fail('aucun round:results reçu');
  const rev = (roundResults.reveals ?? []).find((r) => r.playerId === hiderId);
  if (!rev) fail('reveal du caché absent de round:results');
  if (rev.found !== true) fail('reveal: found devrait être true');
  if (rev.placement && rev.x == null) fail('reveal: position manquante');
  if (!Array.isArray(rev.pixels) || rev.pixels.length !== S * S * 4) fail('reveal: pixels incorrects');
  if (typeof rev.camouflageScore !== 'number') fail('reveal: score camouflage manquant');
  ok(`round:results révèle le caché (found, pos, pixels, camo=${rev.camouflageScore}%)`);
  ok('tous trouvés → recherche terminée en avance (results)');
  a.close();
  b.close();
  console.log('✅ smoke seek OK');
  process.exit(0);
}

function route(s) {
  if (s.phase === 'camouflage') onCamouflage(s);
  else if (s.phase === 'seeking') onSeeking(s);
  else if (s.phase === 'results') onResults(s);
}
a.on('room:snapshot', route);
b.on('room:snapshot', route);

const run = async () => {
  await new Promise((r) => a.on('connect', r));
  await new Promise((r) => b.on('connect', r));
  const created = await emit(a, 'room:create', { mode: 'classic' });
  if (!created.ok) fail('création');
  const joined = await emit(b, 'room:join', { code: created.code });
  if (!joined.ok) fail('join');
  const started = await emit(a, 'room:start');
  if (!started.ok) fail(`start: ${started.error}`);
  setTimeout(() => !done && fail('timeout global'), 60000);
};
run();
