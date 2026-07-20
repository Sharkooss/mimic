import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  EVENTS,
  createRoomSchema,
  joinRoomSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@mimic/shared';
import { env } from './env.js';
import {
  clearRoomTimer,
  createRoom,
  deleteRoom,
  getRoom,
  snapshot,
  type Room,
  type ServerPlayer,
} from './game/rooms.js';
import { startMatch } from './game/match.js';

interface SocketData {
  roomCode: string | null;
  playerId: string;
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
    socket.data.roomCode = null;
    socket.data.playerId = socket.id;

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
      if (room.hostId !== socket.id) {
        return ack({ ok: false, error: "Seul l'hôte peut lancer la partie." });
      }
      const res = startMatch(io, room);
      if (!res.ok) return ack({ ok: false, error: res.error ?? 'Impossible de démarrer.' });
      ack({ ok: true });
    });

    socket.on(EVENTS.roomLeave, () => {
      leaveRoom(io, socket);
    });

    socket.on('disconnect', () => {
      leaveRoom(io, socket);
    });
  });

  return io;
}

function addPlayer(room: Room, socket: MimicSocket, isHost: boolean): void {
  const player: ServerPlayer = {
    id: socket.id,
    socketId: socket.id,
    userId: null,
    pseudo: `Joueur-${socket.id.slice(0, 4)}`,
    level: 1,
    connected: true,
    isHost,
    score: 0,
    role: null,
    found: false,
  };
  room.players.set(player.id, player);
  if (isHost) room.hostId = player.id;
  socket.data.roomCode = room.code;
  socket.join(room.code);
}

function leaveRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: MimicSocket,
): void {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = getRoom(code);
  socket.data.roomCode = null;
  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(code);

  // Salon vidé : on arrête les timers et on supprime.
  if (room.players.size === 0) {
    clearRoomTimer(room);
    deleteRoom(code);
    return;
  }

  // Réassigne l'hôte si besoin.
  if (room.hostId === socket.id) {
    const next = room.players.values().next().value as ServerPlayer | undefined;
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
