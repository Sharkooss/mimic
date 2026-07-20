import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mimic/shared';

/**
 * Client Socket.IO typé (partage les contrats d'événements avec le serveur).
 * En dev, Vite proxifie `/socket.io` vers le serveur Fastify (port 3000).
 */
export type MimicSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: MimicSocket = io({
  autoConnect: false,
  transports: ['websocket'],
});
