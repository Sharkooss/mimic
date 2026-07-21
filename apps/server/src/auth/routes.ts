import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEADERBOARD_SORTS, type LeaderboardEntry, type PublicUser } from '@mimic/shared';
import { prisma } from '../db.js';
import { ARTWORKS } from '../game/artworks.js';
import { hashPassword, signToken, verifyPassword, verifyToken } from './tokens.js';

const registerSchema = z.object({
  email: z.string().trim().email().max(120),
  pseudo: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[\p{L}0-9_.-]+$/u, 'Caractères non autorisés.'),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  login: z.string().trim().min(1).max(120), // email ou pseudo
  password: z.string().min(1).max(100),
});

interface UserRow {
  id: string;
  pseudo: string;
  email: string;
  level: number;
  xp: number;
  avatarUrl: string | null;
}

/** Champs de stats utilisés par le classement (sous-ensemble de PlayerStats). */
interface StatsShape {
  gamesPlayed: number;
  gamesWon: number;
  playersFound: number;
  bestCamouflage: number;
  avgCamouflage: number;
}

const publicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  pseudo: u.pseudo,
  email: u.email,
  level: u.level,
  xp: u.xp,
  avatarUrl: u.avatarUrl ?? null,
});

/** Extrait le compte à partir de l'en-tête Authorization (Bearer), ou null. */
export function userIdFromAuthHeader(header?: string): string | null {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  return payload?.userId ?? null;
}

/** Routes d'authentification (#5). Renvoie 503 si aucune base n'est configurée. */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const noDb = (reply: import('fastify').FastifyReply) =>
    reply.code(503).send({ error: 'Les comptes sont indisponibles sur ce serveur.' });

  app.post('/api/auth/register', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Champs invalides.' });
    }
    const email = parsed.data.email.toLowerCase();
    const { pseudo, password } = parsed.data;
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { pseudo }] },
      select: { id: true },
    });
    if (existing) return reply.code(409).send({ error: 'Email ou pseudo déjà utilisé.' });
    const user = await prisma.user.create({
      data: { email, pseudo, passwordHash: hashPassword(password), stats: { create: {} } },
    });
    return { token: signToken({ userId: user.id, pseudo: user.pseudo }), user: publicUser(user) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Champs invalides.' });
    const { login, password } = parsed.data;
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: login.toLowerCase() }, { pseudo: login }] },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Identifiants incorrects.' });
    }
    return { token: signToken({ userId: user.id, pseudo: user.pseudo }), user: publicUser(user) };
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const userId = userIdFromAuthHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(401).send({ error: 'Compte introuvable.' });
    return { user: publicUser(user) };
  });

  // Galerie personnelle : œuvres collectées en jouant dessus (+ taille du catalogue).
  app.get('/api/me/gallery', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const userId = userIdFromAuthHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
    const rows = await prisma.userArtwork.findMany({
      where: { userId },
      orderBy: { firstSeenAt: 'asc' },
      select: { artworkId: true, timesPlayed: true, firstSeenAt: true },
    });
    return {
      collected: rows.map((r) => ({
        artworkId: r.artworkId,
        timesPlayed: r.timesPlayed,
        firstSeenAt: r.firstSeenAt,
      })),
      total: ARTWORKS.length,
    };
  });

  // Statistiques agrégées du joueur connecté (#18/#19).
  app.get('/api/me/stats', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const userId = userIdFromAuthHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
    const stats = await prisma.playerStats.findUnique({ where: { userId } });
    return { stats: stats ? stripStats(stats) : null };
  });

  // Profil public partageable (#19).
  app.get<{ Params: { pseudo: string } }>('/api/users/:pseudo', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const user = await prisma.user.findUnique({
      where: { pseudo: req.params.pseudo },
      include: { stats: true },
    });
    if (!user) return reply.code(404).send({ error: 'Joueur introuvable.' });
    const { stats, ...u } = user;
    const statsDto = stats ? stripStats(stats) : null;
    return {
      profile: {
        pseudo: u.pseudo,
        level: u.level,
        xp: u.xp,
        avatarUrl: u.avatarUrl ?? null,
        createdAt: u.createdAt,
        stats: statsDto,
      },
    };
  });

  // Classement global public (#24). Tri par XP (défaut), victoires, joueurs
  // trouvés (talent de chercheur) ou meilleur camouflage. Sans base : liste vide
  // (200) pour que la page s'affiche proprement.
  app.get<{ Querystring: { sort?: string; limit?: string } }>('/api/leaderboard', async (req) => {
    const sort = (LEADERBOARD_SORTS as readonly string[]).includes(req.query.sort ?? '')
      ? (req.query.sort as (typeof LEADERBOARD_SORTS)[number])
      : 'xp';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    if (!prisma) return { leaderboard: [] as LeaderboardEntry[], sort };

    let rows: Array<{ user: UserRow; stats: StatsShape | null }>;
    if (sort === 'xp') {
      // Classement par progression : tout le monde (même sans partie jouée).
      const users = await prisma.user.findMany({
        orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
        take: limit,
        include: { stats: true },
      });
      rows = users.map((u) => ({ user: u, stats: u.stats }));
    } else {
      // Classements de performance : uniquement les joueurs ayant joué.
      const field =
        sort === 'wins' ? 'gamesWon' : sort === 'found' ? 'playersFound' : 'bestCamouflage';
      const stats = await prisma.playerStats.findMany({
        where: { gamesPlayed: { gt: 0 } },
        orderBy: [{ [field]: 'desc' }, { gamesPlayed: 'desc' }],
        take: limit,
        include: { user: true },
      });
      rows = stats.map((s) => ({ user: s.user, stats: s }));
    }

    const leaderboard: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      pseudo: r.user.pseudo,
      level: r.user.level,
      xp: r.user.xp,
      gamesPlayed: r.stats?.gamesPlayed ?? 0,
      gamesWon: r.stats?.gamesWon ?? 0,
      playersFound: r.stats?.playersFound ?? 0,
      bestCamouflage: Math.round(r.stats?.bestCamouflage ?? 0),
      avgCamouflage: Math.round(r.stats?.avgCamouflage ?? 0),
    }));
    return { leaderboard, sort };
  });

  // Historique des parties du joueur connecté, paginé (#18/#21).
  app.get<{ Querystring: { offset?: string; limit?: string } }>(
    '/api/me/history',
    async (req, reply) => {
      if (!prisma) return noDb(reply);
      const userId = userIdFromAuthHeader(req.headers.authorization);
      if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
      const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
      const rows = await prisma.matchParticipant.findMany({
        where: { userId },
        orderBy: { match: { createdAt: 'desc' } },
        skip: offset,
        take: limit,
        select: {
          score: true,
          match: {
            select: {
              id: true,
              mode: true,
              createdAt: true,
              _count: { select: { participants: true, rounds: true } },
            },
          },
        },
      });
      const history = rows.map((r) => ({
        matchId: r.match.id,
        mode: r.match.mode,
        playedAt: r.match.createdAt,
        score: r.score,
        players: r.match._count.participants,
        rounds: r.match._count.rounds,
      }));
      return { history, offset, limit };
    },
  );
}

/** Ne garde que les champs de stats exposés (retire userId/updatedAt). */
function stripStats(s: {
  gamesPlayed: number;
  gamesWon: number;
  timesSeeker: number;
  playersFound: number;
  hiddenSeconds: number;
  bestCamouflage: number;
  avgCamouflage: number;
  camouflageSamples: number;
  timesFound: number;
  avgSurvivalSeconds: number;
  missedClicks: number;
  totalClicks: number;
}) {
  return {
    gamesPlayed: s.gamesPlayed,
    gamesWon: s.gamesWon,
    timesSeeker: s.timesSeeker,
    playersFound: s.playersFound,
    hiddenSeconds: s.hiddenSeconds,
    bestCamouflage: s.bestCamouflage,
    avgCamouflage: s.avgCamouflage,
    camouflageSamples: s.camouflageSamples,
    timesFound: s.timesFound,
    avgSurvivalSeconds: s.avgSurvivalSeconds,
    missedClicks: s.missedClicks,
    totalClicks: s.totalClicks,
  };
}
