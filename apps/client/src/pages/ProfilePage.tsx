import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { xpProgress, type MatchHistoryEntry, type PlayerStatsDTO } from '@mimic/shared';
import { useAuthStore } from '../store/authStore.js';
import { getMyHistory, getMyStats } from '../lib/auth.js';
import { Card, StatTile, XpBar } from '../components/ui.js';

/** Page profil : niveau/XP, statistiques agrégées et historique des parties (#19/#21). */
export function ProfilePage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [stats, setStats] = useState<PlayerStatsDTO | null>(null);
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    Promise.all([getMyStats(), getMyHistory()])
      .then(([s, h]) => {
        if (!alive) return;
        setStats(s);
        setHistory(h);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user]);

  if (ready && !user) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">Connecte-toi pour voir ton profil.</p>
        <Link
          to="/"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à l’accueil
        </Link>
      </Card>
    );
  }
  if (!user) return <p className="text-center text-muted">Chargement…</p>;

  const prog = xpProgress(user.xp);
  const played = stats?.gamesPlayed ?? 0;
  const winRate = played ? Math.round((100 * (stats?.gamesWon ?? 0)) / played) : 0;
  const accuracy =
    stats && stats.totalClicks > 0
      ? Math.round((100 * (stats.totalClicks - stats.missedClicks)) / stats.totalClicks)
      : null;

  return (
    <div className="mx-auto max-w-3xl animate-slide-up space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">{user.pseudo}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent">
            {user.pseudo.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="mt-5">
          <XpBar level={prog.level} inLevel={prog.inLevel} span={prog.span} />
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Statistiques
        </h2>
        {loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Parties" value={played} />
            <StatTile label="Victoires" value={stats?.gamesWon ?? 0} hint={`${winRate}%`} />
            <StatTile label="Meilleur camo" value={`${Math.round(stats?.bestCamouflage ?? 0)}%`} />
            <StatTile label="Camo moyen" value={`${Math.round(stats?.avgCamouflage ?? 0)}%`} />
            <StatTile label="Joueurs trouvés" value={stats?.playersFound ?? 0} />
            <StatTile label="Fois trouvé" value={stats?.timesFound ?? 0} />
            <StatTile
              label="Précision"
              value={accuracy != null ? `${accuracy}%` : '—'}
              hint="clics réussis"
            />
            <StatTile
              label="Temps caché"
              value={formatDuration(stats?.hiddenSeconds ?? 0)}
              hint="total"
            />
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Historique
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Aucune partie enregistrée pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((m) => (
              <li
                key={m.matchId}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs capitalize text-accent">
                    {m.mode}
                  </span>
                  <span className="text-sm text-muted">
                    {m.players} joueurs · {m.rounds} manches
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono font-semibold">{m.score} pts</span>
                  <span className="text-xs text-muted">{formatDate(m.playedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
