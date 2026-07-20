import { z } from 'zod';

/**
 * Validation de l'environnement au démarrage.
 * Le process s'arrête immédiatement si une variable requise manque.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().optional(),
  APP_SECRET: z.string().min(16).default('dev-secret-change-me-please-32chars'),
  /** Chemin des fichiers statiques du client à servir (build Vite). */
  CLIENT_DIST_PATH: z.string().default('../client/dist'),
  /** Origines CORS autorisées en dev (séparées par des virgules). */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables d'environnement invalides:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
