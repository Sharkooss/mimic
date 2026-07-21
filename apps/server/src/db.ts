import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Client Prisma partagé, ou `null` si aucune base n'est configurée / disponible.
 * Le jeu reste jouable en invité sans base ; les comptes (#5) et la persistance
 * (#18) s'activent dès qu'une DATABASE_URL est présente ET que le moteur démarre.
 * Toute défaillance d'init est capturée pour ne jamais faire tomber le serveur.
 */
function init(): PrismaClient | null {
  if (!env.DATABASE_URL) return null;
  try {
    const client = new PrismaClient();
    // L'init du moteur est asynchrone : on capture le rejet éventuel pour éviter
    // un « unhandled rejection » fatal (ex. moteur incompatible avec le système).
    void client.$connect().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('⚠  Prisma indisponible — comptes/persistance désactivés :', msg);
    });
    return client;
  } catch (e) {
    console.error('⚠  Init Prisma échouée :', e instanceof Error ? e.message : e);
    return null;
  }
}

export const prisma = init();
export const hasDatabase = prisma !== null;
