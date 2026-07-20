import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  CHARACTER_SIZE,
  EVENTS,
  HIT_RADIUS,
  WRONG_CLICK_COOLDOWN_MS,
  createRoomSchema,
  joinRoomSchema,
  lockCharacterSchema,
  placementSchema,
  seekerClickSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@mimic/shared';
import { scoreCamouflage } from './game/camouflage.js';
import { sampleArtworkBackground } from './game/artworkPixels.js';
import { env } from './env.js';
import {
  clearRoomTimer,
  createRoom,
  deleteRoom,
  findByToken,
  getRoom,
  newPlayerId,
  snapshot,
  type Room,
  type ServerPlayer,
} from './game/rooms.js';
import { maybeEndSeeking, startMatch } from './game/match.js';

/** Délai de grâce (ms) avant de retirer un joueur déconnecté (fenêtre de reconnexion). */
const RECONNECT_GRACE_MS = 30_000;

interface SocketData {
  roomCode: string | null;
  playerId: string;
  token: string;
}

type MimicSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Initialise la couche temps réel.
 * MVP : gestion du lobby (create/join/leave). Le cœur de manche (camouflage,
 * recherche, scoring) sera branché ici au fil des issues de la Phase 2.
 */
export function setupSocket(
  httpServer: HttpServer,
): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: { origin: env.CORS_ORIGINS.split(','), credentials: true },
  });

  io.on('connection', (socket: MimicSocket) => {
    const token = String(socket.handshake.auth?.token ?? '') || socket.id;
    socket.data.roomCode = null;
    socket.data.token = token;
    socket.data.playerId = socket.id;

    // Reconnexion : si ce token correspond à un joueur d'un salon, on le réattache.
    const existing = findByToken(token);
    if (existing) {
      reattach(io, socket, existing.room, existing.player);
    }

    socket.on(EVENTS.roomCreate, (payload, ack) => {
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Paramètres invalides.' });

      const room = createRoom(parsed.data.mode);
      addPlayer(room, socket, true);
      broadcastSnapshot(io, room);
      ack({ ok: true, code: room.code });
    });

    socket.on(EVENTS.roomJoin, (payload, ack) => {
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Code invalide.' });

      // Déjà rattaché à un joueur (reconnexion / rechargement) : on resynchronise
      // au lieu de créer un doublon.
      const existing = findByToken(socket.data.token);
      if (existing) {
        reattach(io, socket, existing.room, existing.player);
        return ack({ ok: true, code: existing.room.code });
      }

      const room = getRoom(parsed.data.code);
      if (!room) return ack({ ok: false, error: 'Salon introuvable.' });
      if (room.phase !== 'lobby') return ack({ ok: false, error: 'La partie a déjà commencé.' });

      addPlayer(room, socket, false);
      broadcastSnapshot(io, room);
      ack({ ok: true, code: room.code });
    });

    socket.on(EVENTS.roomStart, (ack) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room) return ack({ ok: false, error: 'Salon introuvable.' });
      if (room.hostId !== socket.data.playerId) {
        return ack({ ok: false, error: "Seul l'hôte peut lancer la partie." });
      }
      const res = startMatch(io, room);
      if (!res.ok) return ack({ ok: false, error: res.error ?? 'Impossible de démarrer.' });
      ack({ ok: true });
    });

    socket.on(EVENTS.characterMove, (payload) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room || room.phase !== 'camouflage') return;
      const player = room.players.get(socket.data.playerId);
      if (!player || player.role !== 'hider' || player.placement?.locked) return;
      const parsed = placementSchema.safeParse(payload);
      if (!parsed.success) return;
      player.placement = { ...parsed.data, locked: false };
    });

    socket.on(EVENTS.characterLock, (payload, ack) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room || room.phase !== 'camouflage') {
        return ack({ ok: false, error: "Ce n'est pas le moment de verrouiller." });
      }
      const player = room.players.get(socket.data.playerId);
      if (!player || player.role !== 'hider') {
        return ack({ ok: false, error: 'Action réservée aux joueurs cachés.' });
      }
      if (player.placement?.locked) {
        return ack({ ok: false, error: 'Déjà verrouillé.' });
      }
      const parsed = lockCharacterSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Données de personnage invalides.' });

      const { placement, pixels } = parsed.data;
      const character = Uint8ClampedArray.from(pixels);
      const background = sampleArtworkBackground(room.artwork, placement.x, placement.y);
      const breakdown = scoreCamouflage(character, background);

      player.pixels = character;
      player.placement = { ...placement, locked: true };
      player.camouflageScore = breakdown.score;
      ack({ ok: true, breakdown });
    });

    socket.on(EVENTS.seekerClick, (payload, ack) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room || room.phase !== 'seeking') {
        return ack({ ok: false, error: "Ce n'est pas le moment de chercher." });
      }
      const seeker = room.players.get(socket.data.playerId);
      if (!seeker || seeker.role !== 'seeker') {
        return ack({ ok: false, error: 'Action réservée au chercheur.' });
      }
      const now = Date.now();
      if (now < seeker.clickCooldownUntil) {
        return ack({ ok: false, error: 'Patiente un instant après un raté.' });
      }
      const parsed = seekerClickSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Clic invalide.' });
      const { x, y } = parsed.data;

      // Cible = caché verrouillé le plus proche du clic dans le rayon de tolérance.
      let target: ServerPlayer | null = null;
      let best = Infinity;
      for (const p of room.players.values()) {
        if (p.role !== 'hider' || p.found || !p.placement?.locked || !p.pixels) continue;
        const cx = p.placement.x + CHARACTER_SIZE / 2;
        const cy = p.placement.y + CHARACTER_SIZE / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= HIT_RADIUS && dist < best) {
          best = dist;
          target = p;
        }
      }

      if (!target) {
        seeker.clickCooldownUntil = now + WRONG_CLICK_COOLDOWN_MS;
        return ack({ ok: true, hit: false, playerId: null });
      }

      target.found = true;
      target.foundAtMs = now;
      io.to(room.code).emit(EVENTS.playerFound, {
        playerId: target.id,
        byId: seeker.id,
        foundAtMs: now,
        placement: {
          x: target.placement!.x,
          y: target.placement!.y,
          rotation: target.placement!.rotation,
        },
        pixels: Array.from(target.pixels!),
      });
      ack({ ok: true, hit: true, playerId: target.id });
      maybeEndSeeking(io, room);
    });

    socket.on(EVENTS.roomLeave, () => {
      const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined;
      const player = room?.players.get(socket.data.playerId);
      socket.data.roomCode = null;
      if (room && player) {
        socket.leave(room.code);
        removePlayer(io, room, player);
      }
    });

    // Déconnexion : on garde le joueur en « grâce » pour permettre la reconnexion.
    socket.on('disconnect', () => {
      const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined;
      const player = room?.players.get(socket.data.playerId);
      // Ignore si un socket plus récent a déjà repris ce joueur (reconnexion).
      if (!room || !player || player.socketId !== socket.id) return;
      player.connected = false;
      player.socketId = null;
      broadcastSnapshot(io, room);
      player.removeTimer = setTimeout(() => removePlayer(io, room, player), RECONNECT_GRACE_MS);
    });
  });

  return io;
}

function addPlayer(room: Room, socket: MimicSocket, isHost: boolean): void {
  const id = newPlayerId();
  const player: ServerPlayer = {
    id,
    socketId: socket.id,
    token: socket.data.token,
    removeTimer: null,
    userId: null,
    pseudo: `Joueur-${id.slice(2, 6)}`,
    level: 1,
    connected: true,
    isHost,
    score: 0,
    role: null,
    found: false,
    foundAtMs: null,
    placement: null,
    pixels: null,
    camouflageScore: null,
    clickCooldownUntil: 0,
  };
  room.players.set(player.id, player);
  if (isHost) room.hostId = player.id;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  socket.emit(EVENTS.session, { playerId: player.id });
}

/** Réattache un socket (re)connecté à un joueur existant et resynchronise son état. */
function reattach(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: MimicSocket,
  room: Room,
  player: ServerPlayer,
): void {
  if (player.removeTimer) {
    clearTimeout(player.removeTimer);
    player.removeTimer = null;
  }
  player.socketId = socket.id;
  player.connected = true;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  socket.emit(EVENTS.session, { playerId: player.id });
  socket.emit(EVENTS.roomSnapshot, snapshot(room));
  broadcastSnapshot(io, room);
}

/** Retire définitivement un joueur (départ explicite ou grâce expirée). */
function removePlayer(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
  player: ServerPlayer,
): void {
  if (player.removeTimer) {
    clearTimeout(player.removeTimer);
    player.removeTimer = null;
  }
  room.players.delete(player.id);

  // Salon vidé : on arrête les timers et on supprime.
  if (room.players.size === 0) {
    clearRoomTimer(room);
    deleteRoom(room.code);
    return;
  }

  // Réassigne l'hôte à un joueur encore présent si besoin.
  if (room.hostId === player.id) {
    const next =
      [...room.players.values()].find((p) => p.connected) ??
      (room.players.values().next().value as ServerPlayer | undefined);
    room.hostId = next?.id ?? null;
    if (next) next.isHost = true;
  }
  broadcastSnapshot(io, room);
}

function broadcastSnapshot(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): void {
  io.to(room.code).emit(EVENTS.roomSnapshot, snapshot(room));
}
