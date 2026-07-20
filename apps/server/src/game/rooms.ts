import {
  LOBBY,
  type Artwork,
  type CharacterPlacement,
  type GameMode,
  type PlayerRole,
  type RoomSnapshot,
  type PublicPlayer,
} from '@mimic/shared';

/**
 * Registre des salons en mémoire (MVP).
 * À terme : déplacer l'état chaud ici et persister les résultats en base.
 * Pour scaler horizontalement, prévoir un adaptateur Redis (voir ROADMAP).
 */

export interface ServerPlayer extends PublicPlayer {
  socketId: string;
  /** Id du compte si authentifié, sinon null (invité). */
  userId: string | null;
  /** Rôle sur la manche courante (null en lobby). */
  role: PlayerRole | null;
  /** true si trouvé par le chercheur sur la manche courante. */
  found: boolean;
  /** Placement du personnage sur le tableau (null tant que non positionné). */
  placement: CharacterPlacement | null;
}

export interface Room {
  code: string;
  mode: GameMode;
  phase: RoomSnapshot['phase'];
  players: Map<string, ServerPlayer>;
  hostId: string | null;
  round: number;
  totalRounds: number;
  seekerId: string | null;
  phaseEndsAt: number | null;
  createdAt: number;
  /** Œuvre de la manche courante (null en lobby). */
  artwork: Artwork | null;
  /** Œuvres tirées pour la partie (une par manche). */
  artworkSequence: Artwork[];
  /** Ordre de passage des chercheurs (un id par manche). */
  seekerOrder: string[];
  /** Timer de la phase courante (transition automatique). */
  timer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  const { codeAlphabet, codeLength } = LOBBY;
  let code = '';
  do {
    code = '';
    for (let i = 0; i < codeLength; i++) {
      code += codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(mode: GameMode): Room {
  const room: Room = {
    code: generateCode(),
    mode,
    phase: 'lobby',
    players: new Map(),
    hostId: null,
    round: 0,
    totalRounds: 0,
    seekerId: null,
    phaseEndsAt: null,
    createdAt: Date.now(),
    artwork: null,
    artworkSequence: [],
    seekerOrder: [],
    timer: null,
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    players: [...room.players.values()].map(publicView),
    round: room.round,
    totalRounds: room.totalRounds,
    artwork: room.artwork,
    seekerId: room.seekerId,
    phaseEndsAt: room.phaseEndsAt,
  };
}

/** Arrête proprement la manche en cours (timer). */
export function clearRoomTimer(room: Room): void {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function publicView(p: ServerPlayer): PublicPlayer {
  return {
    id: p.id,
    pseudo: p.pseudo,
    level: p.level,
    connected: p.connected,
    isHost: p.isHost,
    score: p.score,
  };
}

/** Nettoie les salons vides plus vieux qu'1h (appelé périodiquement). */
export function pruneEmptyRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now - room.createdAt > 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}

export function roomCount(): number {
  return rooms.size;
}
