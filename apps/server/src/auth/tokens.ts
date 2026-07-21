import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/**
 * Primitives d'authentification sans dépendance native :
 *  - mots de passe hachés avec scrypt (sel aléatoire), comparaison à temps constant ;
 *  - jetons compacts signés HS256 (type JWT) avec APP_SECRET.
 */

/** Hache un mot de passe → `scrypt$<salt>$<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Vérifie un mot de passe contre un hash stocké. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(data: string): string {
  return createHmac('sha256', env.APP_SECRET).update(data).digest('base64url');
}

export interface TokenPayload {
  userId: string;
  pseudo: string;
}

/** Émet un jeton HS256 (30 jours par défaut). */
export function signToken(payload: TokenPayload, ttlSec = 60 * 60 * 24 * 30): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }),
  ).toString('base64url');
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

/** Vérifie et décode un jeton, ou null si invalide/expiré. */
export function verifyToken(token: string): TokenPayload | null {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return null;
  if (sign(`${header}.${body}`) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload & {
      exp?: number;
    };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId) return null;
    return { userId: payload.userId, pseudo: payload.pseudo };
  } catch {
    return null;
  }
}
