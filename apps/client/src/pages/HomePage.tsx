import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EVENTS, LOBBY, type AckResult } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useAuthStore } from '../store/authStore.js';
import { AuthPanel } from '../components/AuthPanel.js';

/** Écran d'accueil : créer un salon ou en rejoindre un via code. */
export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const authReady = useAuthStore((s) => s.ready);
  const authEnabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const showAuth = authReady && authEnabled && !user;

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
    <div className="space-y-10">
      <section className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Fondez-vous dans le tableau.</h1>
        <p className="text-stone-500">
          Peignez votre personnage, cachez-vous dans une œuvre, et débusquez les autres.
        </p>
      </section>

      {showAuth && (
        <div className="mx-auto max-w-sm">
          <AuthPanel />
          <p className="mt-2 text-center text-xs text-stone-400">
            Optionnel : joue en invité ou crée un compte pour garder ta progression.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={createRoom}
          className="rounded-2xl border border-stone-200 bg-white p-6 text-left transition hover:border-accent hover:shadow-sm"
        >
          <div className="text-lg font-semibold">Créer une partie</div>
          <p className="mt-1 text-sm text-stone-500">Génère un code à partager avec tes amis.</p>
        </button>

        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="text-lg font-semibold">Rejoindre</div>
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, LOBBY.codeLength))}
              placeholder="ABC123"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono uppercase tracking-widest outline-none focus:border-accent"
            />
            <button
              onClick={joinRoom}
              disabled={code.length !== LOBBY.codeLength}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              Go
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
