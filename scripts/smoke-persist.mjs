// Smoke test de la persistance (#18) contre la PROD.
// 2 comptes authentifiés jouent une partie complète (2 manches) ; le chercheur
// trouve le caché à sa position connue (fin de recherche anticipée). Puis on
// vérifie /api/me/stats et /api/me/history.
// Usage : node scripts/smoke-persist.mjs   (BASE surchargeable par env)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(fileURLToPath(new URL('../apps/client/package.json', import.meta.url)));
const { io } = req('socket.io-client');

const BASE = process.env.BASE ?? 'https://mimic.louis-nectoux.fr';
const S = 64;
const fail = (m) => {
  console.error('❌', m);
  process.exit(1);
};
const ok = (m) => console.log('✓', m);

async function register() {
  const rnd = Math.random().toString(36).slice(2, 6);
  const email = `p${Date.now()}${rnd}@mimic.test`;
  const pseudo = `P${String(Date.now()).slice(-4)}${rnd}`.slice(0, 18);
  const r = await (
    await fetch(BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pseudo, password: 'password123' }),
    })
  ).json();
  if (!r.token) fail('register KO ' + JSON.stringify(r));
  return { email, pseudo, token: r.token, userId: r.user.id };
}

const placements = new Map(); // pid -> { cx, cy, round }
const seeked = new Set(); // `${pid}:${round}` déjà cliqué
let finished = false;

function onSnap(bot, snap) {
  if (finished) return;
  const isSeeker = snap.seekerId === bot.pid;
  bot.role = snap.seekerId ? (isSeeker ? 'seeker' : 'hider') : null;

  if (snap.phase === 'camouflage' && !isSeeker && snap.artwork) {
    const key = `${bot.pid}:${snap.round}`;
    if (!seeked.has('lock:' + key)) {
      seeked.add('lock:' + key);
      const art = snap.artwork;
      const x = Math.round((art.width - S) / 2);
      const y = Math.round((art.height - S) / 2);
      const pixels = new Array(S * S * 4);
      for (let i = 0; i < pixels.length; i++) pixels[i] = i % 4 === 3 ? 255 : 100;
      bot.sock.emit('character:lock', { placement: { x, y, rotation: 0 }, pixels }, (res) => {
        if (!res.ok) return;
        placements.set(bot.pid, { cx: x + S / 2, cy: y + S / 2, round: snap.round });
      });
    }
  }

  if (snap.phase === 'seeking' && isSeeker) {
    for (const [pid, pl] of placements) {
      if (pl.round !== snap.round) continue;
      const key = `${pid}:${snap.round}`;
      if (seeked.has(key)) continue;
      seeked.add(key);
      bot.sock.emit('seeker:click', { x: pl.cx, y: pl.cy }, () => {});
    }
  }

  if (snap.phase === 'finished' && !finished) {
    finished = true;
    setTimeout(() => verify().catch((e) => fail(e.message)), 2500);
  }
}

async function meStats(token) {
  return (await fetch(BASE + '/api/me/stats', { headers: { Authorization: `Bearer ${token}` } })).json();
}
async function meHistory(token) {
  return (await fetch(BASE + '/api/me/history', { headers: { Authorization: `Bearer ${token}` } })).json();
}

let A, B;

async function verify() {
  ok('partie terminée (phase finished)');
  for (const acct of [A, B]) {
    const { stats } = await meStats(acct.token);
    if (!stats) fail(`stats absentes pour ${acct.pseudo}`);
    if (stats.gamesPlayed !== 1) fail(`gamesPlayed attendu 1, obtenu ${stats.gamesPlayed}`);
    const { history } = await meHistory(acct.token);
    if (!history || history.length !== 1) fail(`historique attendu 1 partie pour ${acct.pseudo}`);
    if (history[0].players !== 2 || history[0].rounds !== 2)
      fail(`historique incohérent: ${JSON.stringify(history[0])}`);
    ok(
      `${acct.pseudo}: gamesPlayed=1, timesSeeker=${stats.timesSeeker}, playersFound=${stats.playersFound}, timesFound=${stats.timesFound}, camoSamples=${stats.camouflageSamples}, historique=1 (2 joueurs, 2 manches)`,
    );
  }
  console.log('✅ smoke persist OK');
  process.exit(0);
}

const run = async () => {
  A = await register();
  B = await register();
  ok(`comptes créés : ${A.pseudo}, ${B.pseudo}`);
  const mk = (acct) => {
    const sock = io(BASE, {
      forceNew: true,
      auth: { token: 'rt-' + acct.pseudo + Date.now(), userToken: acct.token },
    });
    const bot = { acct, sock, pid: null, role: null };
    sock.on('session', (d) => (bot.pid = d.playerId));
    sock.on('room:snapshot', (s) => onSnap(bot, s));
    sock.on('connect_error', (e) => fail('connect_error ' + e.message));
    return bot;
  };
  const a = mk(A);
  const b = mk(B);
  await Promise.all([
    new Promise((r) => a.sock.on('connect', r)),
    new Promise((r) => b.sock.on('connect', r)),
  ]);
  await new Promise((r) => setTimeout(r, 400)); // laisse arriver les sessions
  const created = await new Promise((r) => a.sock.emit('room:create', { mode: 'classic' }, r));
  if (!created.ok) fail('create KO');
  const joined = await new Promise((r) => b.sock.emit('room:join', { code: created.code }, r));
  if (!joined.ok) fail('join KO');
  const started = await new Promise((r) => a.sock.emit('room:start', r));
  if (!started.ok) fail('start KO ' + started.error);
  ok(`partie lancée (salon ${created.code}) — déroulé ~2 min (camouflage ×2)`);
  setTimeout(() => !finished && fail('timeout global (partie non terminée)'), 170000);
};

run().catch((e) => fail(e.message));
