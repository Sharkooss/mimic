import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, EyeOff, Home, Palette, RefreshCw, Search, Timer, Users } from 'lucide-react';
import {
  scoreCamouflage,
  type Artwork,
  type CamouflageBreakdown,
  type RoundReveal,
} from '@mimic/shared';
import { getArtworks, type CatalogueArtwork } from '../lib/auth.js';
import { useCharacterStore } from '../store/characterStore.js';
import { CamouflageBoard } from '../paint/CamouflageBoard.js';
import { ArtworkFocus } from '../paint/ArtworkFocus.js';
import { Button, Card } from '../components/ui.js';
import { LocalSeekBoard, type HiddenCharacter } from '../local/LocalSeekBoard.js';
import { artworkFromImage, loadImage, sampleBackground } from '../local/localScore.js';

type Phase = 'intro' | 'loading' | 'hiding' | 'handoff' | 'seeking' | 'results';
const SEEK_SECONDS = 90;

/**
 * Mode local « hot-seat » (2 joueurs, même PC) : un joueur se cache, un écran de
 * passage neutralise l'écran le temps d'échanger de place, puis l'autre cherche.
 * Entièrement côté client (aucune partie serveur) : le scoring de camouflage et
 * la hitbox sont rejoués localement via `@mimic/shared`.
 */
export function LocalGamePage(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const catalogueRef = useRef<CatalogueArtwork[] | null>(null);

  const [hidden, setHidden] = useState<HiddenCharacter | null>(null);
  const [breakdown, setBreakdown] = useState<CamouflageBreakdown | null>(null);
  const [found, setFound] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const seekStart = useRef(0);

  // Gèle le scroll pendant les phases immersives plein écran.
  const immersive = phase === 'hiding' || phase === 'handoff' || phase === 'seeking';
  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  // Chrono de la recherche.
  useEffect(() => {
    if (phase !== 'seeking' || found) return;
    const id = setInterval(() => {
      if (Date.now() >= deadline) {
        clearInterval(id);
        setElapsedMs(SEEK_SECONDS * 1000);
        setPhase('results');
      } else {
        setNow(Date.now());
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, found, deadline]);

  const startRound = async () => {
    setPhase('loading');
    setError(null);
    try {
      const cat = catalogueRef.current ?? (await getArtworks());
      catalogueRef.current = cat;
      const pool = cat.filter((a) => a.imageUrl);
      if (pool.length === 0) throw new Error('Aucune œuvre disponible.');
      const entry = pool[Math.floor(Math.random() * pool.length)]!;
      const image = await loadImage(entry.imageUrl);
      imgRef.current = image;
      setArtwork(artworkFromImage(entry, image));
      useCharacterStore.getState().reset();
      setHidden(null);
      setBreakdown(null);
      setFound(false);
      setPhase('hiding');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
      setPhase('intro');
    }
  };

  const finishHiding = () => {
    const st = useCharacterStore.getState();
    const img = imgRef.current;
    if (!st.pixels || !img) return;
    setHidden({ x: st.x, y: st.y, rotation: st.rotation, pixels: Array.from(st.pixels) });
    setBreakdown(scoreCamouflage(st.pixels, sampleBackground(img, st.x, st.y)));
    setPhase('handoff');
  };

  const startSeeking = () => {
    seekStart.current = Date.now();
    setDeadline(Date.now() + SEEK_SECONDS * 1000);
    setNow(Date.now());
    setPhase('seeking');
  };

  const onFound = () => {
    if (found) return;
    setFound(true);
    setElapsedMs(Date.now() - seekStart.current);
    setTimeout(() => setPhase('results'), 1300);
  };

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  // ---------- Rendu par phase ----------

  if (phase === 'intro' || phase === 'loading') {
    return (
      <div className="mx-auto max-w-lg animate-fade-in">
        <Card className="space-y-4 p-8 text-center">
          <div className="flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
              <Users className="h-7 w-7" />
            </span>
          </div>
          <h1 className="text-2xl font-bold">Partie locale — 2 joueurs</h1>
          <p className="text-sm text-muted">
            Sur le même écran, à tour de rôle : le premier joueur peint et cache son personnage dans
            l’œuvre, puis passe le PC. Le second cherche sans avoir vu la cachette.
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted">
            <Step icon={<Palette className="h-4 w-4" />} label="1. On se cache" />
            <Step icon={<EyeOff className="h-4 w-4" />} label="2. On passe le PC" />
            <Step icon={<Search className="h-4 w-4" />} label="3. On cherche" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={startRound}
            disabled={phase === 'loading'}
            className="w-full py-3 text-base"
          >
            {phase === 'loading' ? 'Chargement…' : 'Commencer'}
          </Button>
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
            <Home className="h-4 w-4" /> Retour à l’accueil
          </Link>
        </Card>
      </div>
    );
  }

  if (phase === 'hiding' && artwork) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
        <TopBar
          icon={<Palette className="h-5 w-5 text-accent" />}
          title="Joueur 1 — cache-toi"
          subtitle="Peins ton personnage pour le fondre dans l’œuvre, puis termine."
        >
          <Button onClick={finishHiding} className="flex items-center gap-1.5">
            J’ai fini de me cacher <ArrowRight className="h-4 w-4" />
          </Button>
        </TopBar>
        <div className="min-h-0 flex-1">
          <CamouflageBoard key={artwork.id} artwork={artwork} />
        </div>
      </div>
    );
  }

  if (phase === 'handoff') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-night bg-night-radial px-6 text-center text-white">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-white/10">
          <EyeOff className="h-10 w-10" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold">Au tour du chercheur !</h1>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Passe le PC à l’autre joueur. Le chercheur ne doit pas avoir vu l’écran précédent. Quand
            vous êtes prêts, lance la recherche : l’œuvre sera dévoilée.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={startSeeking}
          className="flex items-center gap-2 px-6 py-3 text-base"
        >
          <Search className="h-5 w-5" /> Je suis prêt à chercher
        </Button>
      </div>
    );
  }

  if (phase === 'seeking' && artwork && hidden) {
    const urgent = remaining <= 10;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
        <TopBar
          icon={<Search className="h-5 w-5 text-accent" />}
          title="Joueur 2 — trouve le personnage"
          subtitle="Repère la silhouette peinte dans la toile et clique dessus."
        >
          <span
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-xl tabular-nums transition-colors ${
              urgent
                ? 'animate-heartbeat border-red-200 bg-red-50 text-red-600'
                : 'border-line bg-canvas text-accent'
            }`}
          >
            <Timer className="h-4 w-4" />
            {String(Math.floor(remaining / 60)).padStart(2, '0')}:
            {String(remaining % 60).padStart(2, '0')}
          </span>
        </TopBar>
        <div className="min-h-0 flex-1">
          <LocalSeekBoard artwork={artwork} character={hidden} found={found} onFound={onFound} />
        </div>
      </div>
    );
  }

  if (phase === 'results' && artwork && hidden) {
    const reveal: RoundReveal = {
      playerId: 'local',
      pseudo: 'La cachette',
      x: hidden.x,
      y: hidden.y,
      rotation: hidden.rotation,
      pixels: hidden.pixels,
      found,
      camouflageScore: breakdown?.score ?? null,
    };
    return (
      <div className="mx-auto max-w-lg animate-slide-up">
        <Card className="space-y-5 p-6 text-center">
          <div>
            <h1 className="text-2xl font-bold">{found ? 'Trouvé !' : 'Personne trouvé…'}</h1>
            <p className="mt-1 text-sm text-muted">
              {found
                ? `Le chercheur a débusqué le personnage en ${(elapsedMs / 1000).toFixed(1)} s.`
                : 'Le personnage est resté caché jusqu’au bout. Bien joué au caché !'}
            </p>
          </div>

          <div className="flex justify-center">
            <ArtworkFocus artwork={artwork} reveal={reveal} size={220} />
          </div>

          {breakdown && (
            <div className="rounded-xl border border-line bg-canvas/60 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Qualité du camouflage</span>
                <span className="font-mono text-2xl font-bold text-accent">{breakdown.score}%</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="Couleurs" value={breakdown.colorMatch} />
                <Metric label="Contours" value={breakdown.edgeMatch} />
                <Metric label="Contraste" value={breakdown.contrast} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <Button onClick={startRound} className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" /> Rejouer
            </Button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold transition hover:border-muted/40"
            >
              <Home className="h-4 w-4" /> Accueil
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <p className="p-6 text-center text-muted">Chargement…</p>;
}

function TopBar({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: JSX.Element;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-5 py-3">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-muted transition hover:text-ink" title="Quitter">
          <Home className="h-5 w-5" />
        </Link>
        <span className="h-6 w-px bg-line" />
        {icon}
        <div>
          <div className="text-sm font-bold leading-tight">{title}</div>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Step({ icon, label }: { icon: JSX.Element; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-canvas/60 py-2.5">
      <span className="text-accent">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface py-2">
      <div className="font-mono text-base font-semibold">{value}%</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
