const KEY = 'mimic:playerToken';

/**
 * Token de reconnexion stable, persistant dans le navigateur. Envoyé au serveur
 * via l'auth Socket.IO ; il permet de retrouver son joueur après une coupure ou
 * un rechargement. Distinct de l'id public du joueur (jamais exposé aux autres).
 */
export function getPlayerToken(): string {
  try {
    let t = localStorage.getItem(KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    return crypto.randomUUID();
  }
}
