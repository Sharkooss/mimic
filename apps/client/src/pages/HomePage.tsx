import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      {/* ───────── HÉRO (gauche) ───────── */}
      <section className="relative flex flex-col overflow-hidden rounded-3xl bg-night bg-night-radial text-white shadow-glow">
        {/* halo décoratif */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />

        <div className="relative flex flex-1 flex-col justify-center px-8 py-8 sm:px-12">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
              🎨 Cache-cache dans les chefs-d’œuvre
            </span>
          </div>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Fondez-vous dans
            <br />
            <span className="animate-sheen bg-[linear-gradient(110deg,#b7861f_30%,#f7e6b0_50%,#b7861f_70%)] bg-[length:250%_100%] bg-clip-text text-transparent">
              le tableau.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
            Peignez votre personnage, dissimulez-le dans une œuvre de maître, puis traquez les
            autres joueurs cachés dans la toile.
          </p>

          {/* Mini-étapes */}
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-white/70">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-base">
                  {s.icon}
                </span>
                <span>
                  <span className="font-semibold text-white/90">{s.title}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Vitrine d'œuvres en bas du héro */}
        {gallery.length > 0 && (
          <div className="relative border-t border-white/5 py-5">
            <GalleryStrip items={gallery} />
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
                  className={`flex-1 rounded-lg px-2 py-1.5 transition ${
                    visibility === v ? 'bg-surface shadow-soft' : 'text-muted hover:text-ink'
                  }`}
                >
                  {v === 'public' ? '🌍 Public' : '🔒 Privé'}
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
              <span className="text-2xl">🎨</span>
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
                <span className="text-lg">💾</span>
                <span className="text-muted">
                  <span className="font-semibold text-ink">Crée un compte</span> pour garder ta
                  progression, ton XP et ton historique.
                </span>
              </span>
              <span className="shrink-0 font-semibold text-accent">Connexion →</span>
            </button>
          ))}
      </div>
    </div>
  );
}

const STEPS = [
  { icon: '🎨', title: 'Peins & place' },
  { icon: '🫥', title: 'Cache-toi' },
  { icon: '🔍', title: 'Traque' },
];
