import type { Server } from 'socket.io';
import {
  EVENTS,
  LOBBY,
  PHASE_DURATIONS,
  SCORING,
  type ClientToServerEvents,
  type GamePhase,
  type RoundResults,
  type ServerToClientEvents,
} from '@mimic/shared';
import { clearRoomTimer, snapshot, type Room } from './rooms.js';
import { pickArtworkSequence } from './artworks.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Machine à états de la partie (issue #7).
 * Boucle : lobby → [camouflage → seeking → results] × N → finished.
 * Timers autoritatifs côté serveur ; le client ne fait qu'afficher l'état reçu.
 *
 * NB : le contenu des phases (peinture, clics du chercheur, scoring réel) est
 * implémenté dans les issues suivantes (#8–#14). Ici on pose l'ossature.
 */

/** Démarre la partie (déclenché par l'hôte). */
export function startMatch(io: IO, room: Room): { ok: boolean; error?: string } {
  if (room.phase !== 'lobby') return { ok: false, error: 'La partie a déjà commencé.' };
  const ids = [...room.players.keys()];
  if (ids.length < LOBBY.minPlayers) {
    return { ok: false, error: `Il faut au moins ${LOBBY.minPlayers} joueurs.` };
  }

  room.seekerOrder = shuffle(ids);
  room.totalRounds = room.seekerOrder.length;
  room.artworkSequence = pickArtworkSequence(room.totalRounds);
  room.round = 0;
  beginRound(io, room);
  return { ok: true };
}

/** Prépare et lance une manche (phase camouflage). */
function beginRound(io: IO, room: Room): void {
  room.seekerId = room.seekerOrder[room.round] ?? null;
  room.artwork = room.artworkSequence[room.round] ?? null;

  room.seekingStartedAt = null;
  for (const p of room.players.values()) {
    p.found = false;
    p.foundAtMs = null;
    p.placement = null;
    p.pixels = null;
    p.camouflageScore = null;
    p.clickCooldownUntil = 0;
    p.role = p.id === room.seekerId ? 'seeker' : 'hider';
  }

  setPhase(io, room, 'camouflage', PHASE_DURATIONS.camouflage, () => {
    setPhase(io, room, 'seeking', PHASE_DURATIONS.seeking, () => endRound(io, room));
  });
}

/**
 * Termine la recherche en avance si tous les cachés en jeu (verrouillés) ont été
 * trouvés — inutile de laisser tourner le chrono. Appelé après chaque trouvaille.
 */
export function maybeEndSeeking(io: IO, room: Room): void {
  if (room.phase !== 'seeking') return;
  const inPlay = [...room.players.values()].filter(
    (p) => p.role === 'hider' && p.placement?.locked,
  );
  if (inPlay.length === 0 || inPlay.some((p) => !p.found)) return;
  clearRoomTimer(room);
  endRound(io, room);
}

/** Clôt la manche : attribue les points puis affiche les résultats. */
function endRound(io: IO, room: Room): void {
  const results = awardRoundPoints(room);
  io.to(room.code).emit(EVENTS.roundResults, results);

  setPhase(io, room, 'results', PHASE_DURATIONS.results, () => {
    room.round += 1;
    if (room.round >= room.totalRounds) {
      finishMatch(io, room);
    } else {
      beginRound(io, room);
    }
  });
}

/** Fin de partie : classement final, retour possible au lobby. */
function finishMatch(io: IO, room: Room): void {
  clearRoomTimer(room);
  room.phase = 'finished';
  room.seekerId = null;
  room.artwork = null;
  room.phaseEndsAt = null;
  broadcast(io, room);
  io.to(room.code).emit(EVENTS.phaseChanged, 'finished', null);
}

/** Applique une transition de phase avec timer autoritatif. */
function setPhase(
  io: IO,
  room: Room,
  phase: GamePhase,
  durationSec: number,
  next: () => void,
): void {
  clearRoomTimer(room);
  room.phase = phase;
  if (phase === 'seeking') room.seekingStartedAt = Date.now();
  room.phaseEndsAt = Date.now() + durationSec * 1000;
  broadcast(io, room);
  io.to(room.code).emit(EVENTS.phaseChanged, phase, room.phaseEndsAt);
  room.timer = setTimeout(next, durationSec * 1000);
}

/**
 * Barème (GDD §7). Tant que la recherche n'est pas jouable, aucun caché n'est
 * "found" → ils marquent survie + jamais-trouvé, le chercheur ne marque rien.
 * Le calcul devient significatif avec les issues #9 (chercheur) et #10 (scoring).
 */
function awardRoundPoints(room: Room): RoundResults {
  const scores: RoundResults['scores'] = [];
  const hiders = [...room.players.values()].filter((p) => p.role === 'hider');
  const foundCount = hiders.filter((h) => h.found).length;

  for (const p of room.players.values()) {
    let pts = 0;
    if (p.role === 'seeker') {
      pts += foundCount * SCORING.seekerPerFind;
      if (hiders.length > 0 && foundCount === hiders.length) pts += SCORING.seekerSweepBonus;
    } else if (p.role === 'hider') {
      // Survie horodatée : temps tenu avant d'être trouvé (toute la phase si jamais trouvé).
      const seekStart = room.seekingStartedAt ?? Date.now();
      const seekDurMs = PHASE_DURATIONS.seeking * 1000;
      const survivedMs = p.found && p.foundAtMs != null ? p.foundAtMs - seekStart : seekDurMs;
      const survived = Math.max(
        0,
        Math.floor(survivedMs / 1000 / SCORING.hiddenSurvivalIntervalSec),
      );
      pts += survived * SCORING.hiddenSurvivalPoints;
      if (!p.found) pts += SCORING.hiddenNeverFoundBonus;
      // Bonus proportionnel à la qualité du camouflage (récompense l'effort de peinture).
      pts += Math.round(((p.camouflageScore ?? 0) / 100) * SCORING.hiddenCamouflageBonusMax);
    }
    p.score += pts;
    scores.push({ playerId: p.id, pseudo: p.pseudo, roundPoints: pts, totalScore: p.score });
  }

  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Révélation de tous les cachés en jeu (verrouillés) pour l'écran de résultats.
  const reveals: RoundResults['reveals'] = [];
  for (const p of room.players.values()) {
    if (p.role !== 'hider' || !p.placement?.locked || !p.pixels) continue;
    reveals.push({
      playerId: p.id,
      pseudo: p.pseudo,
      x: p.placement.x,
      y: p.placement.y,
      rotation: p.placement.rotation,
      pixels: Array.from(p.pixels),
      found: p.found,
      camouflageScore: p.camouflageScore,
    });
  }

  return { round: room.round, scores, reveals };
}

function broadcast(io: IO, room: Room): void {
  io.to(room.code).emit(EVENTS.roomSnapshot, snapshot(room));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
