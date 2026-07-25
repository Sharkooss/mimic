// Smoke test du « Rejouer » (retour au lobby après une partie finie).
// 2 bots invités jouent une partie complète en durées minimales, le chercheur
// trouve le caché à sa position connue (fin anticipée). Une fois `finished`,
// l'hôte émet `room:return-to-lobby` : on vérifie que la salle repasse en
// `lobby`, scores/round remis à zéro, puis qu'on peut relancer une partie.
// Usage : BASE=http://localhost:3000 node scripts/smoke-replay.mjs
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

const placements = new Map(); // pid -> { cx, cy, round }
const locked = new Set();
const clicked = new Set();
let phase = 'lobby';
let matchesDone = 0;
let replayed = false;
let done = false;

function onSnap(bot, snap) {
  if (done) return;
  const isSeeker = snap.seekerId === bot.pid;

  if (snap.phase === 'camouflage' && !isSeeker && snap.artwork) {
    const key = `${bot.pid}:${matchesDone}:${snap.round}`;
    if (!locked.has(key)) {
      locked.add(key);
      const art = snap.artwork;
      const x = Math.round((art.width - S) / 2);
      const y = Math.round((art.height - S) / 2);
      const pixels = new Array(S * S * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 120));
      bot.sock.emit(EVENTS.characterLock, { placement: { x, y, rotation: 0 }, pixels }, (res) => {
        if (res.ok) placements.set(bot.pid, { cx: x + S / 2, cy: y + S / 2, round: snap.round });
      });
    }
  }

  if (snap.phase === 'seeking' && isSeeker) {
    for (const [pid, pl] of placements) {
      if (pl.round !== snap.round) continue;
      const key = `${pid}:${matchesDone}:${snap.round}`;
      if (clicked.has(key)) continue;
      clicked.add(key);
      bot.sock.emit(EVENTS.seekerClick, { x: pl.cx, y: pl.cy }, () => {});
    }
  }
}

let A, B;

function watchPhase(bot) {
  bot.sock.on(EVENTS.roomSnapshot, (s) => {
    if (done) return;
    // Suivi de la phase globale (via l'hôte A uniquement pour éviter les doublons).
    if (bot === A) {
      const prev = phase;
      phase = s.phase;
      if (prev !== 'finished' && phase === 'finished') onFinished(s);
      if (replayed && phase === 'lobby' && prev === 'finished') onBackToLobby(s);
    }
    onSnap(bot, s);
  });
}

function onFinished(snap) {
  matchesDone++;
  const total = snap.players.reduce((n, p) => n + p.score, 0);
  ok(`partie ${matchesDone} terminée (finished), total points = ${total}`);
  if (matchesDone === 1) {
    if (total <= 0) fail('aucun point marqué sur la 1re partie (scoring cassé ?)');
    // L'hôte relance.
    replayed = true;
    A.sock.emit(EVENTS.roomReturnToLobby, (res) => {
      if (!res.ok) fail('room:return-to-lobby refusé : ' + res.error);
      ok('hôte a émis room:return-to-lobby (ack ok)');
    });
  } else {
    ok('2e partie jouable jusqu’à la fin après un Rejouer');
    console.log('✅ smoke replay OK');
    done = true;
    process.exit(0);
  }
}

function onBackToLobby(snap) {
  if (snap.phase !== 'lobby') fail('phase attendue lobby, obtenu ' + snap.phase);
  if (snap.round !== 0) fail('round non réinitialisé : ' + snap.round);
  if (snap.seekerId !== null) fail('seekerId non réinitialisé');
  if (snap.artwork !== null) fail('artwork non réinitialisé');
  const totals = snap.players.map((p) => p.score);
  if (totals.some((s) => s !== 0)) fail('scores non remis à zéro : ' + JSON.stringify(totals));
  if (snap.players.length !== 2) fail('joueurs perdus au retour lobby : ' + snap.players.length);
  ok('retour au salon : phase=lobby, round=0, scores=0, 2 joueurs conservés');
  // Relance immédiate d'une nouvelle partie.
  replayed = false;
  phase = 'lobby';
  A.sock.emit(EVENTS.roomStart, (res) => {
    if (!res.ok) fail('impossible de relancer après retour lobby : ' + res.error);
    ok('nouvelle partie relancée depuis le salon');
  });
}

const run = async () => {
  const mk = (name) => {
    const sock = io(BASE, { forceNew: true, auth: { token: 'rt-' + name + Date.now() } });
    const bot = { name, sock, pid: null };
    sock.on(EVENTS.session, (d) => (bot.pid = d.playerId));
    sock.on('connect_error', (e) => fail('connect_error ' + e.message));
    return bot;
  };
  A = mk('A');
  B = mk('B');
  watchPhase(A);
  watchPhase(B);
  await Promise.all([
    new Promise((r) => A.sock.on('connect', r)),
    new Promise((r) => B.sock.on('connect', r)),
  ]);
  await new Promise((r) => setTimeout(r, 300));

  const created = await new Promise((r) => A.sock.emit(EVENTS.roomCreate, { mode: 'classic' }, r));
  if (!created.ok) fail('create KO');
  const joined = await new Promise((r) => B.sock.emit(EVENTS.roomJoin, { code: created.code }, r));
  if (!joined.ok) fail('join KO');
  // Durées minimales pour accélérer le test.
  await new Promise((r) => A.sock.emit(EVENTS.roomSetSettings, { camouflageSec: 15, seekingSec: 30 }, r));
  const started = await new Promise((r) => A.sock.emit(EVENTS.roomStart, r));
  if (!started.ok) fail('start KO ' + started.error);
  ok(`partie lancée (salon ${created.code})`);

  setTimeout(() => !done && fail('timeout global (flux de Rejouer non bouclé)'), 120000);
};

run().catch((e) => fail(e.message));
