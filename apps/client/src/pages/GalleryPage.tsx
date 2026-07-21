import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Images, Lock } from 'lucide-react';
import type { CollectedArtwork } from '@mimic/shared';
import { useAuthStore } from '../store/authStore.js';
import { getArtworks, getMyGallery, type CatalogueArtwork } from '../lib/auth.js';
import { Card } from '../components/ui.js';

/**
 * Galerie personnelle (#25) : chaque œuvre jouée s'ajoute à la collection. Les
 * œuvres non encore rencontrées restent verrouillées (à découvrir en jouant).
 */
export function GalleryPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [catalogue, setCatalogue] = useState<CatalogueArtwork[]>([]);
  const [collected, setCollected] = useState<Map<string, CollectedArtwork>>(new Map());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    Promise.all([getArtworks(), getMyGallery()])
      .then(([arts, gal]) => {
        if (!alive) return;
        setCatalogue(arts);
        setCollected(new Map(gal.collected.map((c) => [c.artworkId, c])));
        setTotal(gal.total || arts.length);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user]);

  // Collectées d'abord (par date de découverte), puis les verrouillées.
  const ordered = useMemo(() => {
    const owned = catalogue.filter((a) => collected.has(a.id));
    owned.sort(
      (a, b) =>
        new Date(collected.get(a.id)!.firstSeenAt).getTime() -
        new Date(collected.get(b.id)!.firstSeenAt).getTime(),
    );
    const locked = catalogue.filter((a) => !collected.has(a.id));
    return [...owned, ...locked];
  }, [catalogue, collected]);

  if (ready && !user) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">Connecte-toi pour bâtir ta galerie d’œuvres.</p>
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

  const count = collected.size;
  const pct = total > 0 ? Math.round((100 * count) / total) : 0;

  return (
    <div className="mx-auto max-w-5xl animate-slide-up space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Images className="h-6 w-6 text-accent" /> Ma galerie
        </h1>
        <p className="text-sm text-muted">
          Chaque œuvre sur laquelle tu joues rejoint ta collection.
        </p>
      </div>

      {/* Progression de collection */}
      <Card className="p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold">Collection</span>
          <span className="font-mono text-sm text-muted">
            <span className="text-lg font-bold text-accent">{count}</span> / {total} œuvres
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-gold transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((a) => {
            const owned = collected.get(a.id);
            return (
              <div
                key={a.id}
                className={`group relative overflow-hidden rounded-xl2 border shadow-soft transition ${
                  owned
                    ? 'animate-pop-in border-line bg-surface hover:-translate-y-1 hover:shadow-pop'
                    : 'border-dashed border-line/70 bg-canvas'
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-night-800">
                  <img
                    src={a.imageUrl}
                    alt={owned ? a.title : 'Œuvre à découvrir'}
                    loading="lazy"
                    className={`h-full w-full object-cover transition duration-500 ${
                      owned ? 'group-hover:scale-105' : 'scale-105 blur-md brightness-50 grayscale'
                    }`}
                  />
                  {!owned && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/80">
                      <Lock className="h-6 w-6" />
                      <span className="text-xs font-medium">À découvrir</span>
                    </div>
                  )}
                  {owned && owned.timesPlayed > 1 && (
                    <span className="absolute right-2 top-2 rounded-full bg-night/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      ×{owned.timesPlayed}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  {owned ? (
                    <>
                      <div className="truncate text-sm font-semibold">{a.title}</div>
                      <div className="truncate text-xs text-muted">{a.author}</div>
                    </>
                  ) : (
                    <div className="text-sm font-semibold text-muted">? ? ?</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
