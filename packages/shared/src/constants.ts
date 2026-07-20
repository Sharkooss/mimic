/**
 * Constantes de gameplay partagées entre le client et le serveur.
 * Source unique de vérité : ne jamais dupliquer ces valeurs ailleurs.
 */

/** Résolution (px) du personnage joueur. Fixe : la silhouette ne change pas. */
export const CHARACTER_SIZE = 64;

/** Nombre de rotations autorisées (par pas de 90°). */
export const CHARACTER_ROTATIONS = [0, 90, 180, 270] as const;
export type CharacterRotation = (typeof CHARACTER_ROTATIONS)[number];

/** Durées de phase par défaut (secondes). Surchargées par mode de jeu. */
export const PHASE_DURATIONS = {
  camouflage: 40,
  seeking: 90,
  results: 12,
} as const;

/** Cooldown (ms) après un clic raté du chercheur, anti-spam. */
export const WRONG_CLICK_COOLDOWN_MS = 3000;

/** Rayon (px, dans l'espace du tableau) autour du centre d'un joueur pour valider un clic. */
export const HIT_RADIUS = CHARACTER_SIZE / 2;

/** Barème de points. */
export const SCORING = {
  /** Chercheur : par joueur trouvé. */
  seekerPerFind: 100,
  /** Chercheur : bonus s'il trouve tout le monde. */
  seekerSweepBonus: 20,
  /** Caché : points par tranche de survie. */
  hiddenSurvivalPoints: 5,
  hiddenSurvivalIntervalSec: 10,
  /** Caché : bonus si jamais trouvé. */
  hiddenNeverFoundBonus: 50,
  /** Seuil de camouflage (%) donnant un bonus XP. */
  camouflageBonusThreshold: 95,
  camouflageBonusXp: 40,
} as const;

/** Contraintes joueurs par partie. */
export const LOBBY = {
  minPlayers: 2,
  maxPlayers: 16,
  codeLength: 6,
  /** Caractères utilisés pour les codes de salon (sans I/O/0/1 ambigus). */
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

/** Progression : XP nécessaire pour atteindre `level` depuis le niveau 1. */
export const xpForLevel = (level: number): number => Math.floor(100 * Math.pow(level, 1.6));

/** Modes de jeu. */
export const GAME_MODES = ['classic', 'everyone-seeks', 'coop', 'blitz', 'ranked'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Difficulté d'un tableau (1 à 4 étoiles). */
export const DIFFICULTY = [1, 2, 3, 4] as const;
export type Difficulty = (typeof DIFFICULTY)[number];
