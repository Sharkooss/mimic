import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Client Prisma partagé, ou `null` si aucune base n'est configurée.
 * Le jeu reste jouable en invité sans base ; les comptes (#5) et la persistance
 * (#18) s'activent dès qu'une DATABASE_URL est présente.
 */
export const prisma = env.DATABASE_URL ? new PrismaClient() : null;

export const hasDatabase = prisma !== null;
