import {
  LOBBY,
  PHASE_DURATIONS,
  type Artwork,
  type CharacterPlacement,
  type GameMode,
  type PlayerRole,
  type RoomListing,
  type RoomSettings,
  type RoomSnapshot,
  type RoomVisibility,
  type PublicPlayer,
} from '@mimic/shared';

/**
 * Registre des salons en mémoire (MVP).
 * À terme : déplacer l'état chaud ici et persister les résultats en base.
 * Pour scaler horizontalement, prévoir un adaptateur Redis (voir ROADMAP).
 */

export interface ServerPlayer extends PublicPlayer {
  /** Socket courant (null si déconnecté en attente de reconnexion). */
  socketId: string | null;
  /** Secret de reconnexion (jamais diffusé). Le socket s'y authentifie. */
  token: string;
  /** Timer de suppression après déconnexion (grâce de reconnexion). */
  removeTimer: ReturnType<typeof setTimeout> | null;
  /** Id du compte si authentifié, sinon null (invité). */
  userId: string | null;
  /** Rôle sur la manche courante (null en lobby). */
  role: PlayerRole | null;
  /** true si trouvé par le chercheur sur la manche courante. */
  found: boolean;
  /** Timestamp (ms epoch) où le joueur a été trouvé, null sinon. */
  foundAtMs: number | null;
  /** Placement du personnage sur le tableau (null tant que non positionné). */
  placement: CharacterPlacement | null;
  /** Pixels RGBA du personnage verrouillé (null tant que non verrouillé). */
  pixels: Uint8ClampedArray | null;
  /** Dernier état peint connu (via la présence), pour le verrouillage auto en fin de camouflage. */
  draftPixels: Uint8ClampedArray | null;
  /** Score de camouflage calculé au verrouillage (0-100), null sinon. */
  camouflageScore: number | null;
  /** (Chercheur) timestamp (ms epoch) avant lequel un nouveau clic est refusé. */
  clickCooldownUntil: number;
  /** Cumuls de statistiques sur la partie (pour la persistance #18). */
  matchStats: MatchStats;
}

/** Statistiques agrégées d'un joueur sur une partie (réinitialisées au démarrage). */
export interface MatchStats {
  roundsAsSeeker: number;
  foundAsSeeker: number;
  timesFound: number;
  survivalMs: number;
  camoSum: number;
  camoSamples: number;
  camoBest: number;
  totalClicks: number;
  missedClicks: number;
}

export function freshMatchStats(): MatchStats {
  return {
    roundsAsSeeker: 0,
    foundAsSeeker: 0,
    timesFound: 0,
    survivalMs: 0,
    camoSum: 0,
    camoSamples: 0,
    camoBest: 0,
    totalClicks: 0,
    missedClicks: 0,
  };
}

export interface Room {
  code: string;
  mode: GameMode;
  visibility: RoomVisibility;
  phase: RoomSnapshot['phase'];
  players: Map<string, ServerPlayer>;
  hostId: string | null;
  round: number;
  totalRounds: number;
  seekerId: string | null;
  phaseEndsAt: number | null;
  createdAt: number;
  /** Réglages de durées ajustables par l'hôte. */
  settings: RoomSettings;
  /** Œuvre de la manche courante (null en lobby). */
  artwork: Artwork | null;
  /** Timestamp (ms epoch) de début de la phase de recherche (pour la survie). */
  seekingStartedAt: number | null;
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

export function createRoom(mode: GameMode, visibility: RoomVisibility = 'private'): Room {
  const room: Room = {
    code: generateCode(),
    mode,
    visibility,
    phase: 'lobby',
    players: new Map(),
    hostId: null,
    round: 0,
    totalRounds: 0,
    seekerId: null,
    phaseEndsAt: null,
    createdAt: Date.now(),
    settings: {
      camouflageSec: PHASE_DURATIONS.camouflage,
      seekingSec: PHASE_DURATIONS.seeking,
    },
    artwork: null,
    seekingStartedAt: null,
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

/** Id public d'un joueur (exposé dans les snapshots), distinct du token de reconnexion. */
export function newPlayerId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Retrouve un joueur (et son salon) par son token de reconnexion. */
export function findByToken(token: string): { room: Room; player: ServerPlayer } | undefined {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.token === token) return { room, player };
    }
  }
  return undefined;
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    mode: room.mode,
    visibility: room.visibility,
    phase: room.phase,
    players: [...room.players.values()].map(publicView),
    round: room.round,
    totalRounds: room.totalRounds,
    artwork: room.artwork,
    seekerId: room.seekerId,
    phaseEndsAt: room.phaseEndsAt,
    settings: { ...room.settings },
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

/** Salons publics rejoignables (en lobby, non pleins), pour le navigateur de parties. */
export function publicListings(): RoomListing[] {
  const list: RoomListing[] = [];
  for (const room of rooms.values()) {
    if (room.visibility !== 'public' || room.phase !== 'lobby') continue;
    if (room.players.size >= LOBBY.maxPlayers) continue;
    const host = room.hostId ? room.players.get(room.hostId) : undefined;
    list.push({
      code: room.code,
      mode: room.mode,
      host: host?.pseudo ?? '—',
      players: room.players.size,
      maxPlayers: LOBBY.maxPlayers,
      createdAt: room.createdAt,
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
