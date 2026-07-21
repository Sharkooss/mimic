import type { CharacterRotation, Difficulty, GameMode } from './constants.js';

/** Phases de la boucle de jeu. */
export type GamePhase = 'lobby' | 'camouflage' | 'seeking' | 'results' | 'finished';

/** Rôle d'un joueur pendant une manche. */
export type PlayerRole = 'seeker' | 'hider';

/** Position/orientation d'un personnage dans l'espace du tableau. */
export interface CharacterPlacement {
  /** Coordonnées du coin haut-gauche dans l'image du tableau (px). */
  x: number;
  y: number;
  rotation: CharacterRotation;
  /** true une fois la position verrouillée par le joueur. */
  locked: boolean;
}

/** Compte utilisateur, vue publique (renvoyée au client authentifié). */
export interface PublicUser {
  id: string;
  pseudo: string;
  email: string;
  level: number;
  xp: number;
  avatarUrl: string | null;
}

/** État public d'un joueur (diffusable à tous). */
export interface PublicPlayer {
  id: string;
  pseudo: string;
  /** Niveau de compte (progression). */
  level: number;
  connected: boolean;
  isHost: boolean;
  /** Score cumulé sur la partie en cours. */
  score: number;
}

/** État d'un joueur pendant une manche (côté serveur, partiellement privé). */
export interface RoundPlayerState {
  playerId: string;
  role: PlayerRole;
  placement: CharacterPlacement | null;
  /** Skin/PNG du personnage peint, encodé (data-url ou id de blob). Privé jusqu'à révélation. */
  found: boolean;
  foundAtMs: number | null;
  /** Score de camouflage calculé au verrouillage (0-100), null tant que non calculé. */
  camouflageScore: number | null;
}

/** Métadonnées d'un tableau. */
export interface Artwork {
  id: string;
  title: string;
  author: string;
  year: string | null;
  /** Dimensions de l'image source (px). */
  width: number;
  height: number;
  difficulty: Difficulty;
  /** Nombre de joueurs conseillé max. */
  recommendedMaxPlayers: number;
  /** Zoom maximal autorisé pour le chercheur. */
  maxZoom: number;
  /** Chemin/URL de l'image. */
  imageUrl: string;
}

/** Décomposition du score de camouflage. */
export interface CamouflageBreakdown {
  /** Score final 0-100. */
  score: number;
  colorMatch: number;
  edgeMatch: number;
  contrast: number;
}

/** État public d'une partie (snapshot diffusé aux clients). */
export interface RoomSnapshot {
  code: string;
  mode: GameMode;
  phase: GamePhase;
  players: PublicPlayer[];
  /** Index de la manche courante (0-based). */
  round: number;
  totalRounds: number;
  /** Tableau de la manche courante (null en lobby). */
  artwork: Artwork | null;
  /** Id du chercheur de la manche (null hors manche). */
  seekerId: string | null;
  /** Timestamp (ms epoch serveur) de fin de la phase courante, null si non minutée. */
  phaseEndsAt: number | null;
}
