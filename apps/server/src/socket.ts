import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  CHARACTER_SIZE,
  EVENTS,
  LOBBY,
  MODE_META,
  WRONG_CLICK_COOLDOWN_MS,
  createRoomSchema,
  joinRoomSchema,
  lockCharacterSchema,
  placementSchema,
  presenceUpdateSchema,
  seekerClickSchema,
  seekerCursorSchema,
  setModeSchema,
  setSettingsSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@mimic/shared';
import { scoreCamouflage } from './game/camouflage.js';
import { characterHit } from './game/hitTest.js';
import { sampleArtworkBackground } from './game/artworkPixels.js';
import { verifyToken } from './auth/tokens.js';
import { env } from './env.js';
import {
  clearRoomTimer,
  createRoom,
  deleteRoom,
  findByToken,
  freshMatchStats,
  getRoom,
  newPlayerId,
  publicListings,
  snapshot,
  type Room,
  type ServerPlayer,
} from './game/rooms.js';
import { maybeEndSeeking, sendSeekingTargets, startMatch } from './game/match.js';

/** Délai de grâce (ms) avant de retirer un joueur déconnecté (fenêtre de reconnexion). */
const RECONNECT_GRACE_MS = 30_000;

interface SocketData {
  roomCode: string | null;
  playerId: string;
  token: string;
  /** Compte authentifié (via userToken), sinon null → joueur invité. */
  userId: string | null;
  accountPseudo: string | null;
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
    const userToken = socket.handshake.auth?.userToken;
    const account = typeof userToken === 'string' ? verifyToken(userToken) : null;
    socket.data.roomCode = null;
    socket.data.token = token;
    socket.data.playerId = socket.id;
    socket.data.userId = account?.userId ?? null;
    socket.data.accountPseudo = account?.pseudo ?? null;

    // Reconnexion : si ce token correspond à un joueur d'un salon, on le réattache.
    const existing = findByToken(token);
    if (existing) {
      reattach(io, socket, existing.room, existing.player);
    }

    socket.on(EVENTS.roomCreate, (payload, ack) => {
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Paramètres invalides.' });
      if (!MODE_META[parsed.data.mode].implemented) {
        return ack({ ok: false, error: "Ce mode n'est pas encore disponible." });
      }

      const room = createRoom(parsed.data.mode, parsed.data.visibility);
      addPlayer(room, socket, true);
      broadcastSnapshot(io, room);
      broadcastLobby(io);
      ack({ ok: true, code: room.code });
    });

    socket.on(EVENTS.lobbyWatch, (ack) => {
      socket.join('lobby');
      ack({ ok: true, rooms: publicListings() });
    });
    socket.on(EVENTS.lobbyUnwatch, () => {
      socket.leave('lobby');
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
      if (room.players.size >= LOBBY.maxPlayers) {
        return ack({ ok: false, error: 'Salon complet.' });
      }

      addPlayer(room, socket, false);
      broadcastSnapshot(io, room);
      broadcastLobby(io);
      ack({ ok: true, code: room.code });
    });

    socket.on(EVENTS.roomSetMode, (payload, ack) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room) return ack({ ok: false, error: 'Salon introuvable.' });
      if (room.phase !== 'lobby') return ack({ ok: false, error: 'La partie a déjà commencé.' });
      if (room.hostId !== socket.data.playerId) {
        return ack({ ok: false, error: "Seul l'hôte peut changer le mode." });
      }
      const parsed = setModeSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Mode invalide.' });
      if (!MODE_META[parsed.data.mode].implemented) {
        return ack({ ok: false, error: "Ce mode n'est pas encore disponible." });
      }
      room.mode = parsed.data.mode;
      // Changer de mode réaligne les durées sur son preset (l'hôte peut ensuite
      // les ré-ajuster au curseur).
      room.settings = { ...MODE_META[parsed.data.mode].durations };
      broadcastSnapshot(io, room);
      broadcastLobby(io);
      ack({ ok: true });
    });

    socket.on(EVENTS.roomSetSettings, (payload, ack) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room) return ack({ ok: false, error: 'Salon introuvable.' });
      if (room.phase !== 'lobby') return ack({ ok: false, error: 'La partie a déjà commencé.' });
      if (room.hostId !== socket.data.playerId) {
        return ack({ ok: false, error: "Seul l'hôte peut changer les réglages." });
      }
      const parsed = setSettingsSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Réglages invalides.' });
      if (parsed.data.camouflageSec !== undefined) {
        room.settings.camouflageSec = parsed.data.camouflageSec;
      }
      if (parsed.data.seekingSec !== undefined) room.settings.seekingSec = parsed.data.seekingSec;
      broadcastSnapshot(io, room);
      ack({ ok: true });
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
      broadcastLobby(io); // le salon quitte le lobby → disparaît de la liste publique
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

    // Présence temps réel : relayée UNIQUEMENT aux autres cachés (jamais au chercheur).
    socket.on(EVENTS.presenceUpdate, (payload) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room || room.phase !== 'camouflage') return;
      const player = room.players.get(socket.data.playerId);
      if (!player || player.role !== 'hider') return;
      const parsed = presenceUpdateSchema.safeParse(payload);
      if (!parsed.success) return;
      // Mémorise le dernier état connu : il devient le camouflage définitif au
      // verrouillage automatique de fin de phase (le joueur n'a rien à valider).
      if (!player.placement?.locked) {
        player.placement = {
          x: parsed.data.x,
          y: parsed.data.y,
          rotation: parsed.data.rotation,
          locked: false,
        };
        player.draftPixels = Uint8ClampedArray.from(parsed.data.pixels);
      }
      const data = {
        playerId: player.id,
        pseudo: player.pseudo,
        x: parsed.data.x,
        y: parsed.data.y,
        rotation: parsed.data.rotation,
        pixels: parsed.data.pixels,
      };
      for (const other of room.players.values()) {
        if (other.id === player.id || other.role !== 'hider' || !other.socketId) continue;
        io.to(other.socketId).emit(EVENTS.presence, data);
      }
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
      seeker.matchStats.totalClicks++;

      // Cible = caché verrouillé dont la silhouette peinte est touchée au pixel
      // près ; en cas de recouvrement, le plus proche du centre l'emporte.
      let target: ServerPlayer | null = null;
      let best = Infinity;
      for (const p of room.players.values()) {
        if (p.role !== 'hider' || p.found || !p.placement?.locked || !p.pixels) continue;
        if (!characterHit(p.pixels, p.placement.x, p.placement.y, p.placement.rotation, x, y)) {
          continue;
        }
        const cx = p.placement.x + CHARACTER_SIZE / 2;
        const cy = p.placement.y + CHARACTER_SIZE / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < best) {
          best = dist;
          target = p;
        }
      }

      if (!target) {
        seeker.matchStats.missedClicks++;
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

    // Curseur du chercheur : relayé en temps réel aux AUTRES joueurs (spectacle
    // de la traque). Non validé lourdement : payload minimal, aucun ack.
    socket.on(EVENTS.seekerCursor, (payload) => {
      const code = socket.data.roomCode;
      const room = code ? getRoom(code) : undefined;
      if (!room || room.phase !== 'seeking' || room.seekerId !== socket.data.playerId) return;
      const parsed = seekerCursorSchema.safeParse(payload);
      if (!parsed.success) return;
      socket.to(room.code).emit(EVENTS.seekerCursor, { x: parsed.data.x, y: parsed.data.y });
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
    userId: socket.data.userId,
    pseudo: socket.data.accountPseudo ?? `Joueur-${id.slice(2, 6)}`,
    level: 1,
    connected: true,
    isHost,
    score: 0,
    role: null,
    found: false,
    foundAtMs: null,
    placement: null,
    pixels: null,
    draftPixels: null,
    camouflageScore: null,
    clickCooldownUntil: 0,
    matchStats: freshMatchStats(),
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
  // Le chercheur qui se reconnecte en pleine recherche doit récupérer les cibles.
  if (room.phase === 'seeking' && room.seekerId === player.id) sendSeekingTargets(io, room);
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
    broadcastLobby(io);
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
  broadcastLobby(io);
}

function broadcastSnapshot(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): void {
  io.to(room.code).emit(EVENTS.roomSnapshot, snapshot(room));
}

/** Pousse la liste des salons publics aux clients qui parcourent le lobby. */
function broadcastLobby(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.to('lobby').emit(EVENTS.publicRooms, publicListings());
}
