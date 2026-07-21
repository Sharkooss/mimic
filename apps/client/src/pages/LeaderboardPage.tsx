import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Medal, Palette, Search, Star, Trophy } from 'lucide-react';
import { LEADERBOARD_SORTS, type LeaderboardEntry, type LeaderboardSort } from '@mimic/shared';
import { useAuthStore } from '../store/authStore.js';
import { getLeaderboard } from '../lib/auth.js';
import { Card } from '../components/ui.js';

type IconType = ComponentType<{ className?: string }>;

/** Libellés + icône + accès à la valeur triée pour chaque critère de classement. */
const SORTS: Record<
  LeaderboardSort,
  { label: string; Icon: IconType; value: (e: LeaderboardEntry) => string }
> = {
  xp: { label: 'Niveau', Icon: Star, value: (e) => `Niv. ${e.level}` },
  wins: { label: 'Victoires', Icon: Trophy, value: (e) => `${e.gamesWon}` },
  found: { label: 'Chasseur', Icon: Search, value: (e) => `${e.playersFound}` },
  camo: { label: 'Camouflage', Icon: Palette, value: (e) => `${e.bestCamouflage}%` },
};

/** Couleur de la médaille par rang (or / argent / bronze). */
const MEDAL_COLOR = [
  'text-gold fill-gold/25',
  'text-stone-400 fill-stone-200',
  'text-amber-700 fill-amber-700/20',
];

/** Classement global des joueurs (#24), triable par plusieurs critères. */
export function LeaderboardPage(): JSX.Element {
  const enabled = useAuthStore((s) => s.enabled);
  const ready = useAuthStore((s) => s.ready);
  const myPseudo = useAuthStore((s) => s.user?.pseudo);
  const [sort, setSort] = useState<LeaderboardSort>('xp');
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLeaderboard(sort)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sort]);

  if (ready && !enabled) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">Le classement n’est pas disponible sur ce serveur.</p>
        <Link
          to="/"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à l’accueil
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-slide-up space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Medal className="h-6 w-6 text-gold" /> Classement
        </h1>
        <p className="text-sm text-muted">
          Les meilleurs joueurs de Mimic, tous comptes confondus.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEADERBOARD_SORTS.map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              sort === s
                ? 'bg-accent text-white shadow-soft'
                : 'border border-line text-muted hover:border-muted/40'
            }`}
          >
            {(() => {
              const Icon = SORTS[s].Icon;
              return <Icon className="h-4 w-4" />;
            })()}
            {SORTS[s].label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-sm text-muted">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            Aucun joueur classé pour l’instant — lance une partie !
          </p>
        ) : (
          <ol>
            {rows.map((e) => {
              const isMe = e.pseudo === myPseudo;
              return (
                <li
                  key={e.pseudo}
                  className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 ${
                    isMe ? 'bg-accent-soft/60' : ''
                  }`}
                >
                  <span className="flex w-8 justify-center">
                    {e.rank <= 3 ? (
                      <Medal className={`h-5 w-5 ${MEDAL_COLOR[e.rank - 1]}`} />
                    ) : (
                      <span className="font-mono text-muted">{e.rank}</span>
                    )}
                  </span>
                  <Link
                    to={`/u/${encodeURIComponent(e.pseudo)}`}
                    className="min-w-0 flex-1 truncate font-medium hover:text-accent"
                  >
                    {e.pseudo}
                    {isMe && <span className="ml-2 text-xs text-accent">(toi)</span>}
                  </Link>
                  <span className="hidden text-xs text-muted sm:block">
                    {e.gamesPlayed} parties
                  </span>
                  <span className="w-20 text-right font-mono font-semibold text-accent">
                    {SORTS[sort].value(e)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
