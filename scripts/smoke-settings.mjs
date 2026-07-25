// Smoke test des réglages avancés + phases sans chrono.
// A(hôte) + B. On règle camouflage/recherche en mode LIBRE (sans chrono), puis :
//  - la traque démarre dès que tous les cachés ont validé (character:lock) ;
//  - phaseEndsAt=null (libre) mais phaseStartedAt renseigné (zoom progressif) ;
//  - le chercheur termine la traque via seeker:end → passage aux résultats.
// Usage : BASE=http://localhost:3000 node scripts/smoke-settings.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CHARACTER_SIZE, EVENTS } from '../packages/shared/dist/index.js';
const req = createRequire(fileURLToPath(new URL('../apps/client/package.json', import.meta.url)));
const { io } = req('socket.io-client');

const BASE = process.env.BASE ?? 'http://localhost:3000';
const S = CHARACTER_SIZE;
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);
const emit = (sock, ...a) => new Promise((r) => sock.emit(...a, r));

const WANT = {
  camouflageTimed: false,
  seekingTimed: false,
  boardSize: 1000,
  progressiveZoom: true,
  zoomStepSec: 10,
  maxZoom: 5,
  hintsEnabled: false,
};

const locked = new Set();
let startedAt = 0;
let seekingSeenAt = 0;
let done = false;

function pixels() {
  return new Array(S * S * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 130));
}

function onSnap(bot, snap) {
  if (done) return;
  const isSeeker = snap.seekerId === bot.pid;

  if (snap.phase === 'camouflage' && !isSeeker && snap.artwork) {
    const key = `${bot.pid}:${snap.round}`;
    if (locked.has(key)) return;
    locked.add(key);
    const x = Math.round((snap.artwork.width - S) / 2);
    const y = Math.round((snap.artwork.height - S) / 2);
    bot.sock.emit(
      EVENTS.characterLock,
      { placement: { x, y, rotation: 0 }, pixels: pixels() },
      () => {},
    );
  }

  if (snap.phase === 'seeking') {
    if (bot === A && !seekingSeenAt) {
      seekingSeenAt = Date.now();
      const elapsed = (seekingSeenAt - startedAt) / 1000;
      // Bien plus rapide que le chrono de camouflage par défaut (40 s) → preuve
      // que c'est la validation de tous les cachés qui a lancé la traque.
      if (elapsed > 8)
        fail(`traque lancée trop tard (${elapsed.toFixed(1)}s) : validation non prise en compte`);
      if (snap.phaseEndsAt !== null) fail('phaseEndsAt devrait être null en mode sans chrono');
      if (!snap.phaseStartedAt) fail('phaseStartedAt manquant (nécessaire au zoom progressif)');
      ok(
        `traque démarrée ${elapsed.toFixed(1)}s après le lancement (tous validés), sans chrono (phaseEndsAt=null, phaseStartedAt ok)`,
      );
    }
    // Le chercheur (quel que soit le bot) met fin à la traque (mode libre).
    if (snap.seekerId === bot.pid && !bot.ended) {
      bot.ended = true;
      bot.sock.emit(EVENTS.seekerEnd, (res) => {
        if (!res.ok) fail('seeker:end refusé : ' + res.error);
        ok('chercheur a terminé la traque (seeker:end)');
      });
    }
  }

  if (snap.phase === 'results' && bot === A && !done) {
    done = true;
    ok('passage aux résultats après seeker:end');
    console.log('✅ smoke settings OK');
    process.exit(0);
  }
}

let A, B;

const run = async () => {
  const mk = (name) => {
    const sock = io(BASE, { forceNew: true, auth: { token: 'rt-' + name + Date.now() } });
    const bot = { name, sock, pid: null, ended: false };
    sock.on(EVENTS.session, (d) => (bot.pid = d.playerId));
    sock.on(EVENTS.roomSnapshot, (s) => onSnap(bot, s));
    sock.on('connect_error', (e) => fail('connect_error ' + e.message));
    return bot;
  };
  A = mk('A');
  B = mk('B');
  await Promise.all([
    new Promise((r) => A.sock.on('connect', r)),
    new Promise((r) => B.sock.on('connect', r)),
  ]);
  await new Promise((r) => setTimeout(r, 300));

  const created = await emit(A.sock, EVENTS.roomCreate, { mode: 'classic' });
  if (!created.ok) fail('create KO');
  const joined = await emit(B.sock, EVENTS.roomJoin, { code: created.code });
  if (!joined.ok) fail('join KO');

  // Capture le snapshot diffusé par le set-settings pour vérifier les réglages.
  const snapP = new Promise((r) => {
    const h = (s) => {
      A.sock.off(EVENTS.roomSnapshot, h);
      r(s);
    };
    A.sock.on(EVENTS.roomSnapshot, h);
  });
  const set = await emit(A.sock, EVENTS.roomSetSettings, WANT);
  if (!set.ok) fail('set-settings KO : ' + set.error);
  const snap = await snapP;
  for (const [k, v] of Object.entries(WANT)) {
    if (snap.settings[k] !== v) fail(`réglage ${k} attendu ${v}, obtenu ${snap.settings[k]}`);
  }
  ok('tous les réglages sont appliqués et diffusés dans le snapshot');

  startedAt = Date.now();
  const started = await emit(A.sock, EVENTS.roomStart);
  if (!started.ok) fail('start KO ' + started.error);
  ok(`partie lancée (salon ${created.code}) en mode sans chrono`);

  setTimeout(() => !done && fail('timeout global (flux sans-chrono non bouclé)'), 30000);
};

run().catch((e) => fail(e.message));
