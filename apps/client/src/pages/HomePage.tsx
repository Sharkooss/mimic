import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EVENTS, LOBBY, type AckResult } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useAuthStore } from '../store/authStore.js';
import { AuthPanel } from '../components/AuthPanel.js';
import { Badge, Button, Card, GalleryStrip, type GalleryItem } from '../components/ui.js';

/** Écran d'accueil : hero « galerie », vitrine d'œuvres, créer / rejoindre un salon. */
export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
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

  const createRoom = () => {
    socket.emit(EVENTS.roomCreate, { mode: 'classic' }, (res: AckResult<{ code: string }>) => {
      if (res.ok) navigate(`/room/${res.code}`);
      else setError(res.error);
    });
  };

  const joinRoom = () => {
    socket.emit(EVENTS.roomJoin, { code }, (res: AckResult<{ code: string }>) => {
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
            <p className="mt-1 text-sm text-muted">
              Génère un code de salon à partager avec tes amis.
            </p>
          </div>
          <Button onClick={createRoom} className="mt-5 w-full py-3">
            Nouvelle partie
          </Button>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <div className="text-lg font-semibold">Rejoindre</div>
            <p className="mt-1 text-sm text-muted">Entre le code d’un salon existant.</p>
          </div>
          <div className="mt-5 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, LOBBY.codeLength))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === LOBBY.codeLength && joinRoom()}
              placeholder="ABC123"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-mono uppercase tracking-widest outline-none transition focus:border-accent"
            />
            <Button
              variant="gold"
              onClick={joinRoom}
              disabled={code.length !== LOBBY.codeLength}
              className="px-5"
            >
              Go
            </Button>
          </div>
        </Card>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

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
