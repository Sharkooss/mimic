import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useSocket } from './hooks/useSocket.js';
import { useGameStore } from './store/gameStore.js';
import { useAuthStore } from './store/authStore.js';
import { accountsEnabled, fetchMe, logout } from './lib/auth.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { PaintPage } from './pages/PaintPage.js';

export default function App(): JSX.Element {
  useSocket();
  const connected = useGameStore((s) => s.connected);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setEnabled = useAuthStore((s) => s.setEnabled);
  const setReady = useAuthStore((s) => s.setReady);

  // Amorçage de l'auth : disponibilité des comptes + session en cours.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [enabled, me] = await Promise.all([accountsEnabled(), fetchMe()]);
      if (!alive) return;
      setEnabled(enabled);
      setUser(me);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [setEnabled, setUser, setReady]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <span className="text-accent">●</span> Mimic
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="flex items-center gap-2 text-sm">
              <span className="font-medium">{user.pseudo}</span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                niv. {user.level}
              </span>
              <button
                onClick={() => {
                  logout();
                  setUser(null);
                }}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                déconnexion
              </button>
            </span>
          )}
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              connected ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'
            }`}
          >
            {connected ? 'connecté' : 'hors ligne'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:code" element={<LobbyPage />} />
          <Route path="/paint" element={<PaintPage />} />
        </Routes>
      </main>
    </div>
  );
}
