import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Ghost, Globe, Lock, Palette, Save, Search } from 'lucide-react';
import { EVENTS, LOBBY, MODE_META, type AckResult, type RoomListing } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useAuthStore } from '../store/authStore.js';
import { AuthPanel } from '../components/AuthPanel.js';
import { Badge, Button, Card, GalleryStrip, type GalleryItem } from '../components/ui.js';

/** Écran d'accueil : une seule vue sans scroll — héro à gauche, actions et parties à droite. */
export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const authReady = useAuthStore((s) => s.ready);
  const authEnabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const showAuth = authReady && authEnabled && !user;

  useEffect(() => {
    let alive = true;
    fetch('/api/artworks')
      .then((r) => r.json())
      .then((d: { artworks: GalleryItem[] }) => {
        if (alive) setGallery((d.artworks ?? []).slice(0, 12));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Navigateur de parties publiques (liste live).
  useEffect(() => {
    const onList = (list: RoomListing[]) => setRooms(list);
    socket.on(EVENTS.publicRooms, onList);
    const watch = () => socket.emit(EVENTS.lobbyWatch, (res) => res.ok && setRooms(res.rooms));
    if (socket.connected) watch();
    socket.on('connect', watch);
    return () => {
      socket.off(EVENTS.publicRooms, onList);
      socket.off('connect', watch);
      socket.emit(EVENTS.lobbyUnwatch);
    };
  }, []);

  const createRoom = () => {
    socket.emit(
      EVENTS.roomCreate,
      { mode: 'classic', visibility },
      (res: AckResult<{ code: string }>) => {
        if (res.ok) navigate(`/room/${res.code}`);
        else setError(res.error);
      },
    );
  };

  const joinByCode = () => join(code);
  const join = (c: string) => {
    socket.emit(EVENTS.roomJoin, { code: c }, (res: AckResult<{ code: string }>) => {
      if (res.ok) navigate(`/room/${res.code}`);
      else setError(res.error);
    });
  };

  return (
    <div className="grid h-[calc(100dvh-8rem)] min-h-[540px] animate-fade-in grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      {/* ───────── HÉRO (gauche) : mur d'œuvres en vedette ───────── */}
      <section className="relative flex flex-col overflow-hidden rounded-3xl bg-night bg-night-radial text-white shadow-glow">
        {/* halo décoratif */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />

        {/* Bloc titre (compact) */}
        <div className="relative shrink-0 px-8 pt-8 sm:px-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
            <Palette className="h-3.5 w-3.5" /> Cache-cache dans les chefs-d’œuvre
          </span>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-[3.4rem]">
            Fondez-vous dans{' '}
            <span className="animate-sheen bg-[linear-gradient(110deg,#b7861f_30%,#f7e6b0_50%,#b7861f_70%)] bg-[length:250%_100%] bg-clip-text text-transparent">
              le tableau.
            </span>
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-white/75">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10">
                  <s.Icon className="h-4 w-4 text-white/90" />
                </span>
                <span className="font-semibold text-white/90">{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MUR D'ŒUVRES — élément central : 2 rangées qui défilent en sens opposés */}
        {gallery.length > 0 && (
          <div className="relative mt-6 flex flex-1 flex-col justify-center gap-4 overflow-hidden py-2">
            <GalleryStrip items={gallery} size="lg" durationSec={55} caption={false} />
            <GalleryStrip items={[...gallery].reverse()} size="lg" durationSec={48} reverse />
            {/* fondus haut/bas pour fondre le mur dans le héro */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-night to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-night to-transparent" />
          </div>
        )}
      </section>

      {/* ───────── ACTIONS (droite) ───────── */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Créer */}
          <Card className="flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-pop">
            <div className="text-base font-semibold">Créer une partie</div>
            <div className="mt-3 flex gap-1.5 rounded-xl bg-canvas p-1 text-sm font-medium">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition ${
                    visibility === v ? 'bg-surface shadow-soft' : 'text-muted hover:text-ink'
                  }`}
                >
                  {v === 'public' ? (
                    <>
                      <Globe className="h-4 w-4" /> Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Privé
                    </>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted">
              {visibility === 'public'
                ? 'Visible par tous dans la liste des parties.'
                : 'Accessible uniquement avec le code.'}
            </p>
            <Button onClick={createRoom} className="mt-3 w-full py-2.5">
              Nouvelle partie
            </Button>
          </Card>

          {/* Rejoindre */}
          <Card className="flex flex-col p-5">
            <div className="text-base font-semibold">Rejoindre</div>
            <p className="mt-1 text-xs text-muted">Avec le code d’un salon.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, LOBBY.codeLength))}
              onKeyDown={(e) =>
                e.key === 'Enter' && code.length === LOBBY.codeLength && joinByCode()
              }
              placeholder="ABC123"
              className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-center font-mono uppercase tracking-[0.3em] outline-none transition focus:border-accent"
            />
            <Button
              variant="gold"
              onClick={joinByCode}
              disabled={code.length !== LOBBY.codeLength}
              className="mt-2 w-full py-2.5"
            >
              Rejoindre
            </Button>
          </Card>
        </div>

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {/* Parties publiques (défilement interne si besoin) */}
        <Card className="flex min-h-0 flex-1 flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Parties publiques
            </h2>
            <span className="text-xs text-muted">
              {rooms.length} ouvert{rooms.length > 1 ? 's' : ''}
            </span>
          </div>
          {rooms.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">
              <Palette className="h-7 w-7 text-muted/60" />
              <span className="mt-1">Aucune partie publique — lance-en une !</span>
            </div>
          ) : (
            <ul className="-mr-1 flex-1 space-y-2 overflow-y-auto pr-1">
              {rooms.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas/50 px-3 py-2.5 transition hover:border-accent/40 hover:bg-surface"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="font-mono text-base font-bold tracking-widest">{r.code}</span>
                    <Badge>{MODE_META[r.mode].label}</Badge>
                    <span className="truncate text-xs text-muted">
                      {r.host} · {r.players}/{r.maxPlayers}
                    </span>
                  </span>
                  <Button onClick={() => join(r.code)} className="shrink-0 px-3.5 py-1.5 text-sm">
                    Rejoindre
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Compte (optionnel, replié par défaut pour tenir dans l'écran) */}
        {showAuth &&
          (showAuthForm ? (
            <div className="animate-slide-up">
              <AuthPanel />
            </div>
          ) : (
            <button
              onClick={() => setShowAuthForm(true)}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm transition hover:border-accent/40 hover:shadow-soft"
            >
              <span className="flex items-center gap-2">
                <Save className="h-5 w-5 shrink-0 text-accent" />
                <span className="text-muted">
                  <span className="font-semibold text-ink">Crée un compte</span> pour garder ta
                  progression, ton XP et ton historique.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold text-accent">
                Connexion <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}

const STEPS: { Icon: ComponentType<{ className?: string }>; title: string }[] = [
  { Icon: Palette, title: 'Peins & place' },
  { Icon: Ghost, title: 'Cache-toi' },
  { Icon: Search, title: 'Traque' },
];
