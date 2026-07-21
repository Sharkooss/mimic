import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env, isProd } from './env.js';
import { roomCount } from './game/rooms.js';
import { hasDatabase } from './db.js';
import { registerAuthRoutes } from './auth/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Construit l'app Fastify (API HTTP + service des fichiers statiques du client). */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(','),
    credentials: true,
  });

  // Healthcheck (utilisé par Docker et Traefik).
  app.get('/api/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    rooms: roomCount(),
  }));

  app.get('/api/version', async () => ({ name: 'mimic', version: '0.1.0', accounts: hasDatabase }));

  // Authentification (#5) — actif seulement si une base est configurée.
  await registerAuthRoutes(app);

  // Service du client en production (build Vite).
  const clientDist = resolve(__dirname, env.CLIENT_DIST_PATH);
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist, wildcard: false });
    // SPA fallback : toute route non-API renvoie index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'Not found' });
        return;
      }
      reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`Client build introuvable (${clientDist}). API seule.`);
  }

  return app;
}
