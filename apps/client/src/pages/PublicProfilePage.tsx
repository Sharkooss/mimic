import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { xpForLevel, type PublicProfile } from '@mimic/shared';
import { getProfile } from '../lib/auth.js';
import { Card, StatTile, XpBar } from '../components/ui.js';

/** Profil public d'un joueur (#19), atteint depuis le classement (/u/:pseudo). */
export function PublicProfilePage(): JSX.Element {
  const { pseudo } = useParams<{ pseudo: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pseudo) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getProfile(pseudo)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Erreur.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [pseudo]);

  if (loading) return <p className="text-center text-muted">Chargement…</p>;

  if (error || !profile) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">{error ?? 'Joueur introuvable.'}</p>
        <Link
          to="/leaderboard"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au classement
        </Link>
      </Card>
    );
  }

  const stats = profile.stats;
  // Reconstitue la progression dans le niveau depuis l'XP totale.
  const base = xpForLevel(profile.level);
  const span = xpForLevel(profile.level + 1) - base;
  const played = stats?.gamesPlayed ?? 0;
  const winRate = played ? Math.round((100 * (stats?.gamesWon ?? 0)) / played) : 0;

  return (
    <div className="mx-auto max-w-3xl animate-slide-up space-y-6">
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Classement
      </Link>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">{profile.pseudo}</div>
            <div className="text-sm text-muted">Membre depuis {formatDate(profile.createdAt)}</div>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent">
            {profile.pseudo.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="mt-5">
          <XpBar level={profile.level} inLevel={profile.xp - base} span={span} />
        </div>
      </Card>

      {stats ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Statistiques
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Parties" value={played} />
            <StatTile label="Victoires" value={stats.gamesWon} hint={`${winRate}%`} />
            <StatTile label="Meilleur camo" value={`${Math.round(stats.bestCamouflage)}%`} />
            <StatTile label="Joueurs trouvés" value={stats.playersFound} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Ce joueur n’a pas encore de statistiques.</p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
