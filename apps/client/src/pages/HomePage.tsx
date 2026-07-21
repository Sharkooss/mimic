import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EVENTS, LOBBY, type AckResult, type GameMode, type RoomListing } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useAuthStore } from '../store/authStore.js';
import { AuthPanel } from '../components/AuthPanel.js';
import { Badge, Button, Card, GalleryStrip, type GalleryItem } from '../components/ui.js';

const MODE_LABELS: Record<GameMode, string> = {
  classic: 'Classique',
  'everyone-seeks': 'Tout le monde cherche',
  coop: 'Coopératif',
  blitz: 'Blitz',
  ranked: 'Classé',
};

/** Écran d'accueil : hero, vitrine d'œuvres, créer (public/privé) / rejoindre / parties publiques. */
export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [rooms, setRooms] = useState<RoomListing[]>([]);
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
    <div className="animate-fade-in space-y-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl bg-night bg-night-radial text-white shadow-glow">
        <div className="px-6 pb-6 pt-12 text-center sm:px-10">
          <div className="mb-5 flex justify-center">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              🎨 Cache-cache dans les chefs-d’œuvre
            </span>
          </div>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Fondez-vous dans
            <br />
            <span className="text-gold">le tableau.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/60 sm:text-base">
            Peignez votre personnage, dissimulez-le dans une œuvre de maître, puis traquez les
            autres joueurs cachés dans la toile.
          </p>
        </div>
        {gallery.length > 0 && (
          <div className="pb-10">
            <GalleryStrip items={gallery} />
          </div>
        )}
        <div className="mx-auto mb-6 h-px w-40 bg-gold-line" />
      </section>

      {/* ACTIONS */}
      <div className="mx-auto -mt-16 grid max-w-2xl gap-4 px-2 sm:grid-cols-2">
        <Card className="flex flex-col justify-between p-6 transition hover:-translate-y-0.5 hover:shadow-pop">
          <div>
            <div className="text-lg font-semibold">Créer une partie</div>
            <p className="mt-1 text-sm text-muted">Lance un salon et invite tes amis.</p>
            <div className="mt-4 flex gap-1.5 rounded-xl bg-canvas p-1 text-sm font-medium">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex-1 rounded-lg px-3 py-1.5 transition ${
                    visibility === v ? 'bg-surface shadow-soft' : 'text-muted'
                  }`}
                >
                  {v === 'public' ? '🌍 Public' : '🔒 Privé'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {visibility === 'public'
                ? 'Visible par tous dans la liste des parties.'
                : 'Accessible uniquement avec le code.'}
            </p>
          </div>
          <Button onClick={createRoom} className="mt-4 w-full py-3">
            Nouvelle partie
          </Button>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <div className="text-lg font-semibold">Rejoindre par code</div>
            <p className="mt-1 text-sm text-muted">Entre le code d’un salon.</p>
          </div>
          <div className="mt-5 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, LOBBY.codeLength))}
              onKeyDown={(e) =>
                e.key === 'Enter' && code.length === LOBBY.codeLength && joinByCode()
              }
              placeholder="ABC123"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-mono uppercase tracking-widest outline-none transition focus:border-accent"
            />
            <Button
              variant="gold"
              onClick={joinByCode}
              disabled={code.length !== LOBBY.codeLength}
              className="px-5"
            >
              Go
            </Button>
          </div>
        </Card>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {/* PARTIES PUBLIQUES */}
      <div className="mx-auto max-w-2xl px-2">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Parties publiques
          </h2>
          <span className="text-xs text-muted">
            {rooms.length} salon{rooms.length > 1 ? 's' : ''} ouvert{rooms.length > 1 ? 's' : ''}
          </span>
        </div>
        {rooms.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">
            Aucune partie publique pour l’instant — crée-en une ! 🎨
          </Card>
        ) : (
          <ul className="space-y-2">
            {rooms.map((r) => (
              <li
                key={r.code}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-soft"
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-lg font-bold tracking-widest">{r.code}</span>
                  <Badge>{MODE_LABELS[r.mode]}</Badge>
                  <span className="text-sm text-muted">
                    {r.host} · {r.players}/{r.maxPlayers}
                  </span>
                </span>
                <Button onClick={() => join(r.code)} className="px-4 py-1.5 text-sm">
                  Rejoindre
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAuth && (
        <div className="mx-auto max-w-sm pt-2">
          <div className="mb-2 flex items-center justify-center gap-2 text-xs text-muted">
            <Badge tone="muted">Optionnel</Badge>
            <span>Crée un compte pour garder ta progression, ton XP et ton historique.</span>
          </div>
          <AuthPanel />
        </div>
      )}

      {/* Comment jouer */}
      <div className="mx-auto grid max-w-3xl gap-4 pt-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={i} className="rounded-xl2 border border-line bg-surface/60 p-5">
            <div className="font-display text-2xl text-accent">{i + 1}</div>
            <div className="mt-1 font-semibold">{s.title}</div>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { title: 'Peins & place', text: 'Camoufle ton personnage dans une œuvre, pinceau à la main.' },
  { title: 'Cache-toi', text: 'Verrouille ta pose avant la fin du temps imparti.' },
  { title: 'Traque', text: 'À ton tour de chercheur : débusque les autres dans la toile.' },
];
