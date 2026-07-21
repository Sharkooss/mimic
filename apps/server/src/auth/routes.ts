import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublicUser } from '@mimic/shared';
import { prisma } from '../db.js';
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

  // Statistiques agrégées du joueur connecté (#18/#19).
  app.get('/api/me/stats', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const userId = userIdFromAuthHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
    const stats = await prisma.playerStats.findUnique({ where: { userId } });
    return { stats };
  });

  // Historique des parties du joueur connecté (#18/#21).
  app.get('/api/me/history', async (req, reply) => {
    if (!prisma) return noDb(reply);
    const userId = userIdFromAuthHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ error: 'Non authentifié.' });
    const rows = await prisma.matchParticipant.findMany({
      where: { userId },
      orderBy: { match: { createdAt: 'desc' } },
      take: 20,
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
    return { history };
  });
}
