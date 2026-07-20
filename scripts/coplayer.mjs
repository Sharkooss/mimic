// Co-joueur de test manuel (issue #13) : crée un salon, affiche le CODE, démarre
// dès qu'un 2e joueur (le navigateur) a rejoint, et — s'il est tiré caché —
// verrouille un personnage rouge bien visible au centre pour servir de cible.
// Reste en vie pour laisser jouer le navigateur. Usage: node scripts/coplayer.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const clientPkg = fileURLToPath(new URL('../apps/client/package.json', import.meta.url));
const { io } = createRequire(clientPkg)('socket.io-client');

const S = 64;
const URL_ = `http://localhost:${process.env.PORT ?? 3000}`;
const sock = io(URL_, { transports: ['websocket'], forceNew: true });
const emit = (ev, p) => new Promise((r) => (p === undefined ? sock.emit(ev, r) : sock.emit(ev, p, r)));

let started = false;
let locked = false;

sock.on('room:snapshot', async (snap) => {
  const me = snap.players.find((p) => p.id === sock.id);
  const role = snap.seekerId ? (snap.seekerId === sock.id ? 'CHERCHEUR' : 'caché') : '—';
  console.log(`[snap] phase=${snap.phase} joueurs=${snap.players.length} monRole=${role}`);

  if (snap.phase === 'lobby' && snap.players.length >= 2 && me?.isHost && !started) {
    started = true;
    const res = await emit('room:start');
    console.log('[start]', res.ok ? 'OK' : res.error);
  }

  if (snap.phase === 'camouflage' && snap.seekerId && snap.seekerId !== sock.id && !locked) {
    locked = true;
    const art = snap.artwork;
    const x = Math.round((art.width - S) / 2);
    const y = Math.round((art.height - S) / 2);
    const pixels = new Array(S * S * 4);
    for (let k = 0; k < pixels.length; k += 4) {
      pixels[k] = 220;
      pixels[k + 1] = 40;
      pixels[k + 2] = 40;
      pixels[k + 3] = 255;
    }
    const res = await emit('character:lock', { placement: { x, y, rotation: 0 }, pixels });
    console.log('[lock caché]', res.ok ? `score=${res.breakdown.score}%` : res.error, `@(${x},${y})`);
  }
});

sock.on('player:found', (d) => console.log('[player:found]', d.playerId, '@', d.placement));

const run = async () => {
  await new Promise((r) => sock.on('connect', r));
  const created = await emit('room:create', { mode: 'classic' });
  console.log('CODE=' + created.code);
};
run();
