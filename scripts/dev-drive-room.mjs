// Pilote de dev : crée un salon, attend un 2e joueur, lance la partie, reste
// connecté et rejoue la présence du bot pendant le camouflage. Sert à vérifier
// visuellement l'écran de jeu avec un vrai navigateur en face.
// Usage : node scripts/dev-drive-room.mjs [port]
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/client/package.json', import.meta.url));
const { io } = require('socket.io-client');

const PORT = process.argv[2] ?? '3000';
const S = 64;

const s = io(`http://localhost:${PORT}`, {
  auth: { token: 'dev-driver-' + Date.now() },
  transports: ['websocket'],
});

const pixels = () => {
  const px = new Array(S * S * 4).fill(0);
  for (let i = 0; i < S * S; i++) {
    px[i * 4] = 168;
    px[i * 4 + 1] = 85;
    px[i * 4 + 2] = 247;
    px[i * 4 + 3] = 255;
  }
  return px;
};

let started = false;
s.on('connect', () => {
  s.emit('room:create', { mode: 'classic', visibility: 'private' }, (r) => {
    if (!r.ok) {
      console.error('create failed:', r.error);
      process.exit(1);
    }
    console.log('CODE=' + r.code);
  });
});

s.on('room:snapshot', (snap) => {
  if (snap.phase === 'lobby' && snap.players.length >= 2 && !started) {
    started = true;
    s.emit('room:start', (r) => console.log('start:', JSON.stringify(r)));
  }
  if (snap.phase === 'camouflage') {
    // Présence du bot : coin supérieur gauche, violet.
    s.emit('presence:update', { x: 40, y: 40, rotation: 0, pixels: pixels() });
  }
});

s.on('phase:changed', (phase) => console.log('phase:', phase));
setTimeout(() => process.exit(0), 240_000);
