/**
 * Constantes de gameplay partagées entre le client et le serveur.
 * Source unique de vérité : ne jamais dupliquer ces valeurs ailleurs.
 */

/** Résolution (px) du personnage joueur. Fixe : la silhouette ne change pas.
 * Plus la valeur est haute, plus la peinture est détaillée (au prix de la bande
 * passante de présence : l'empreinte fait CHARACTER_SIZE²·4 octets). */
export const CHARACTER_SIZE = 96;

/** Nombre de rotations autorisées (par pas de 90°). */
export const CHARACTER_ROTATIONS = [0, 90, 180, 270] as const;
export type CharacterRotation = (typeof CHARACTER_ROTATIONS)[number];

/** Durées de phase par défaut (secondes). Surchargées par les réglages de salon. */
export const PHASE_DURATIONS = {
  camouflage: 40,
  seeking: 90,
  results: 12,
} as const;

/** Bornes (secondes) que l'hôte peut choisir pour chaque phase réglable. */
export const PHASE_BOUNDS = {
  camouflage: { min: 15, max: 120 },
  seeking: { min: 30, max: 240 },
} as const;

/** Cooldown (ms) après un clic raté du chercheur, anti-spam. */
export const WRONG_CLICK_COOLDOWN_MS = 3000;

/**
 * Tolérance (px, espace tableau) autour de la silhouette peinte pour valider un
 * clic. Le clic doit tomber sur un pixel opaque du personnage (hitbox au pixel
 * près), à cette marge près — plus de « touché de loin » sur la boîte englobante.
 */
export const HIT_TOLERANCE = 3;

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
  /** Caché : bonus de points proportionnel à la qualité du camouflage (score 0-100 → 0-max). */
  hiddenCamouflageBonusMax: 30,
  /** Seuil de camouflage (%) donnant un bonus XP. */
  camouflageBonusThreshold: 95,
  camouflageBonusXp: 40,
  /** XP de partie (#20). */
  matchXpBase: 20,
  matchXpPerFind: 6,
  matchXpPerSurvivalMinute: 8,
  matchXpWin: 30,
} as const;

/** Contraintes joueurs par partie. */
export const LOBBY = {
  minPlayers: 2,
  maxPlayers: 16,
  codeLength: 6,
  /** Caractères utilisés pour les codes de salon (sans I/O/0/1 ambigus). */
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

/** Progression : XP cumulée nécessaire pour atteindre `level` (niveau 1 = 0 XP requis). */
export const xpForLevel = (level: number): number =>
  level <= 1 ? 0 : Math.floor(100 * Math.pow(level - 1, 1.6));

/** Niveau atteint pour un total d'XP (>= 1). */
export const levelForXp = (xp: number): number => {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
};

/** XP restante et seuil vers le niveau suivant (pour une barre de progression). */
export function xpProgress(xp: number): { level: number; inLevel: number; span: number } {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, inLevel: xp - base, span: next - base };
}

/** Modes de jeu. */
export const GAME_MODES = ['classic', 'everyone-seeks', 'coop', 'blitz', 'ranked'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Visibilité d'un salon : public (listé, rejoignable sans code) ou privé (par code). */
export const ROOM_VISIBILITIES = ['public', 'private'] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

/** Difficulté d'un tableau (1 à 4 étoiles). */
export const DIFFICULTY = [1, 2, 3, 4] as const;
export type Difficulty = (typeof DIFFICULTY)[number];
