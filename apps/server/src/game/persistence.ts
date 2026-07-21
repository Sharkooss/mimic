import type { Server } from 'socket.io';
import {
  EVENTS,
  SCORING,
  levelForXp,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@mimic/shared';
import { prisma } from '../db.js';
import { ARTWORKS } from './artworks.js';
import type { Room, ServerPlayer } from './rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Persistance des parties (#18). Best-effort : toute erreur est capturée et ne
 * doit jamais affecter le jeu. No-op si aucune base n'est configurée.
 */

/** Sème / met à jour le catalogue d'œuvres en base (id = slug), pour lier les manches. */
export async function seedArtworks(): Promise<void> {
  if (!prisma) return;
  try {
    for (const a of ARTWORKS) {
      const fields = {
        title: a.title,
        author: a.author,
        year: a.year,
        width: a.width,
        height: a.height,
        difficulty: a.difficulty,
        recommendedMaxPlayers: a.recommendedMaxPlayers,
        maxZoom: a.maxZoom,
        imageUrl: a.imageUrl,
        active: true,
      };
      await prisma.artwork.upsert({
        where: { id: a.id },
        update: fields,
        create: { id: a.id, ...fields },
      });
    }
    console.log(`✓ Catalogue d'œuvres en base (${ARTWORKS.length}).`);
  } catch (e) {
    console.error('⚠  seedArtworks :', e instanceof Error ? e.message : e);
  }
}

/** Écrit une partie terminée (Match + participants + manches) et met à jour les stats. */
export async function persistMatch(io: IO, room: Room): Promise<void> {
  if (!prisma) return;
  const players = [...room.players.values()];
  if (players.length === 0 || room.totalRounds === 0) return;

  try {
    const topScore = Math.max(...players.map((p) => p.score));
    // Œuvres réellement présentes en base (évite une violation de clé étrangère).
    const rounds = room.artworkSequence.slice(0, room.totalRounds);
    const known = new Set(
      (
        await prisma.artwork.findMany({
          where: { id: { in: rounds.map((a) => a.id) } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    await prisma.match.create({
      data: {
        code: room.code,
        mode: room.mode,
        endedAt: new Date(),
        participants: {
          create: players.map((p) => ({
            userId: p.userId ?? undefined,
            pseudo: p.pseudo,
            score: p.score,
          })),
        },
        rounds: {
          create: rounds.map((art, i) => ({
            index: i,
            artworkId: known.has(art.id) ? art.id : null,
            seekerId: room.players.get(room.seekerOrder[i] ?? '')?.pseudo ?? null,
          })),
        },
      },
    });

    // Stats + XP des joueurs authentifiés.
    for (const p of players) {
      if (!p.userId) continue;
      const won = p.score === topScore && topScore > 0;
      await updatePlayerStats(p, won);
      await awardXp(io, p, won);
    }
  } catch (e) {
    console.error('⚠  persistMatch :', e instanceof Error ? e.message : e);
  }
}

/** Calcule et attribue l'XP de partie, met à jour le niveau et notifie le joueur (#20). */
async function awardXp(io: IO, p: ServerPlayer, won: boolean): Promise<void> {
  if (!prisma || !p.userId) return;
  const s = p.matchStats;
  const gained =
    SCORING.matchXpBase +
    s.foundAsSeeker * SCORING.matchXpPerFind +
    Math.round((s.survivalMs / 60000) * SCORING.matchXpPerSurvivalMinute) +
    (s.camoBest >= SCORING.camouflageBonusThreshold ? SCORING.camouflageBonusXp : 0) +
    (won ? SCORING.matchXpWin : 0);

  const user = await prisma.user.findUnique({
    where: { id: p.userId },
    select: { xp: true, level: true },
  });
  if (!user) return;
  const xp = user.xp + gained;
  const level = levelForXp(xp);
  await prisma.user.update({ where: { id: p.userId }, data: { xp, level } });

  if (p.socketId) {
    io.to(p.socketId).emit(EVENTS.progress, { gained, xp, level, leveledUp: level > user.level });
  }
}

const ZERO_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  timesSeeker: 0,
  playersFound: 0,
  hiddenSeconds: 0,
  bestCamouflage: 0,
  avgCamouflage: 0,
  camouflageSamples: 0,
  timesFound: 0,
  avgSurvivalSeconds: 0,
  missedClicks: 0,
  totalClicks: 0,
};

async function updatePlayerStats(p: ServerPlayer, won: boolean): Promise<void> {
  if (!prisma || !p.userId) return;
  const s = p.matchStats;
  const prev = (await prisma.playerStats.findUnique({ where: { userId: p.userId } })) ?? ZERO_STATS;

  const camouflageSamples = prev.camouflageSamples + s.camoSamples;
  const avgCamouflage =
    camouflageSamples > 0
      ? (prev.avgCamouflage * prev.camouflageSamples + s.camoSum) / camouflageSamples
      : 0;
  const hiddenSeconds = prev.hiddenSeconds + Math.floor(s.survivalMs / 1000);
  // Approx : les manches en tant que caché ≈ les échantillons de camouflage (1 verrou/manche).
  const avgSurvivalSeconds = camouflageSamples > 0 ? hiddenSeconds / camouflageSamples : 0;

  const data = {
    gamesPlayed: prev.gamesPlayed + 1,
    gamesWon: prev.gamesWon + (won ? 1 : 0),
    timesSeeker: prev.timesSeeker + s.roundsAsSeeker,
    playersFound: prev.playersFound + s.foundAsSeeker,
    hiddenSeconds,
    bestCamouflage: Math.max(prev.bestCamouflage, s.camoBest),
    avgCamouflage,
    camouflageSamples,
    timesFound: prev.timesFound + s.timesFound,
    avgSurvivalSeconds,
    missedClicks: prev.missedClicks + s.missedClicks,
    totalClicks: prev.totalClicks + s.totalClicks,
  };

  await prisma.playerStats.upsert({
    where: { userId: p.userId },
    update: data,
    create: { userId: p.userId, ...data },
  });
}
