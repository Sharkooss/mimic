import { z } from 'zod';
import { CHARACTER_ROTATIONS, CHARACTER_SIZE, GAME_MODES, LOBBY } from './constants.js';
import type { CharacterRotation } from './constants.js';
import type { CamouflageBreakdown, CharacterPlacement, RoomSnapshot } from './types.js';

/* -------------------------------------------------------------------------- */
/*  Schémas de payload (validés côté serveur avec zod)                        */
/* -------------------------------------------------------------------------- */

export const createRoomSchema = z.object({
  mode: z.enum(GAME_MODES).default('classic'),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().toUpperCase().length(LOBBY.codeLength),
});

export const placementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.union([
    z.literal(CHARACTER_ROTATIONS[0]),
    z.literal(CHARACTER_ROTATIONS[1]),
    z.literal(CHARACTER_ROTATIONS[2]),
    z.literal(CHARACTER_ROTATIONS[3]),
  ]),
});

/** Le personnage peint, envoyé au verrouillage. RGBA brut aplati (length = size*size*4). */
export const lockCharacterSchema = z.object({
  placement: placementSchema,
  /** Pixels RGBA du personnage (Uint8, 0-255). */
  pixels: z.array(z.number().int().min(0).max(255)).length(CHARACTER_SIZE * CHARACTER_SIZE * 4),
});

export const seekerClickSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>;
export type PlacementPayload = z.infer<typeof placementSchema>;
export type LockCharacterPayload = z.infer<typeof lockCharacterSchema>;
export type SeekerClickPayload = z.infer<typeof seekerClickSchema>;

/* -------------------------------------------------------------------------- */
/*  Contrats d'événements Socket.IO                                           */
/* -------------------------------------------------------------------------- */

/** Événements émis par le client vers le serveur. */
export interface ClientToServerEvents {
  'room:create': (
    payload: CreateRoomPayload,
    ack: (res: AckResult<{ code: string }>) => void,
  ) => void;
  'room:join': (payload: JoinRoomPayload, ack: (res: AckResult<{ code: string }>) => void) => void;
  'room:leave': () => void;
  'room:start': (ack: (res: AckResult) => void) => void;
  'character:move': (payload: PlacementPayload) => void;
  'character:lock': (
    payload: LockCharacterPayload,
    ack: (res: AckResult<{ breakdown: CamouflageBreakdown }>) => void,
  ) => void;
  'seeker:click': (
    payload: SeekerClickPayload,
    ack: (res: AckResult<{ hit: boolean; playerId: string | null }>) => void,
  ) => void;
}

/** Révélation d'un caché trouvé : diffusée à toute la salle pour l'afficher à sa cachette. */
export interface PlayerFoundReveal {
  playerId: string;
  byId: string;
  foundAtMs: number;
  /** Position révélée (le chercheur ne la connaît qu'une fois le caché trouvé). */
  placement: Pick<CharacterPlacement, 'x' | 'y' | 'rotation'>;
  /** Pixels RGBA du personnage, pour le dessiner à sa cachette. */
  pixels: number[];
}

/** Événements émis par le serveur vers le client. */
export interface ServerToClientEvents {
  /** Id public du joueur pour ce socket (à la connexion/reconnexion). */
  session: (data: { playerId: string }) => void;
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  'phase:changed': (phase: RoomSnapshot['phase'], phaseEndsAt: number | null) => void;
  'player:found': (data: PlayerFoundReveal) => void;
  'round:results': (data: RoundResults) => void;
  'error:toast': (message: string) => void;
}

/** Résultat générique d'un ack. */
export type AckResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? unknown : T)) | { ok: false; error: string };

/** Révélation d'un caché en fin de manche (position + apparence, pour l'écran de résultats). */
export interface RoundReveal {
  playerId: string;
  pseudo: string;
  x: number;
  y: number;
  rotation: CharacterRotation;
  pixels: number[];
  found: boolean;
  camouflageScore: number | null;
}

export interface RoundResults {
  round: number;
  scores: Array<{ playerId: string; pseudo: string; roundPoints: number; totalScore: number }>;
  /** Positions révélées de tous les cachés en jeu (diffusées à tous en fin de manche). */
  reveals: RoundReveal[];
}

/** Noms d'événements en constantes (évite les fautes de frappe). */
export const EVENTS = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomStart: 'room:start',
  session: 'session',
  roomSnapshot: 'room:snapshot',
  characterMove: 'character:move',
  characterLock: 'character:lock',
  seekerClick: 'seeker:click',
  phaseChanged: 'phase:changed',
  playerFound: 'player:found',
  roundResults: 'round:results',
  errorToast: 'error:toast',
} as const;
