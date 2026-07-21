import type { PublicUser } from '@mimic/shared';
import { refreshSocketAuth } from './socket.js';

/** Stockage du jeton de compte + appels d'API d'authentification (#5). */

const KEY = 'mimic:authToken';

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

async function post(path: string, body: unknown): Promise<{ token: string; user: PublicUser }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Une erreur est survenue.');
  return data as { token: string; user: PublicUser };
}

export interface RegisterInput {
  email: string;
  pseudo: string;
  password: string;
}
export interface LoginInput {
  login: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const data = await post('/api/auth/register', input);
  setAuthToken(data.token);
  refreshSocketAuth();
  return data.user;
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const data = await post('/api/auth/login', input);
  setAuthToken(data.token);
  refreshSocketAuth();
  return data.user;
}

export function logout(): void {
  setAuthToken(null);
  refreshSocketAuth();
}

/** Récupère le compte courant depuis le jeton stocké, ou null. */
export async function fetchMe(): Promise<PublicUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) setAuthToken(null);
    return null;
  }
  const data = (await res.json()) as { user: PublicUser };
  return data.user;
}

/** Indique si le serveur propose les comptes (base configurée). */
export async function accountsEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/version');
    const data = (await res.json()) as { accounts?: boolean };
    return Boolean(data.accounts);
  } catch {
    return false;
  }
}
