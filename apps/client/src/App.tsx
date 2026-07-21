import { useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useSocket } from './hooks/useSocket.js';
import { useGameStore } from './store/gameStore.js';
import { useAuthStore } from './store/authStore.js';
import { accountsEnabled, fetchMe, logout } from './lib/auth.js';
import { Wordmark } from './components/ui.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { PaintPage } from './pages/PaintPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { LeaderboardPage } from './pages/LeaderboardPage.js';
import { PublicProfilePage } from './pages/PublicProfilePage.js';

export default function App(): JSX.Element {
  useSocket();
  const connected = useGameStore((s) => s.connected);
  const user = useAuthStore((s) => s.user);
  const enabled = useAuthStore((s) => s.enabled);
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
      {/* Fond décoratif : aurores colorées diffuses qui flottent doucement. */}
      <div className="app-aurora" aria-hidden>
        <span className="-left-40 -top-40 h-[34rem] w-[34rem] animate-float bg-accent/25" />
        <span
          className="right-[-8rem] top-10 h-[28rem] w-[28rem] animate-float bg-gold/20"
          style={{ animationDelay: '-2s', animationDuration: '8s' }}
        />
        <span
          className="bottom-[-10rem] left-1/3 h-[30rem] w-[30rem] animate-float bg-accent/15"
          style={{ animationDelay: '-4s', animationDuration: '9s' }}
        />
      </div>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line/70 bg-canvas/80 px-6 py-3 backdrop-blur-md">
        <Link to="/" className="transition hover:opacity-80">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3">
          {enabled && (
            <Link
              to="/leaderboard"
              className="rounded-full px-2 py-1 text-sm font-medium text-muted transition hover:bg-line/60 hover:text-ink"
            >
              🏅 Classement
            </Link>
          )}
          {user && (
            <span className="flex items-center gap-2 text-sm">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-full px-2 py-1 transition hover:bg-line/60"
              >
                <span className="font-medium">{user.pseudo}</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                  niv. {user.level}
                </span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  setUser(null);
                }}
                className="text-xs text-muted hover:text-ink"
              >
                déconnexion
              </button>
            </span>
          )}
          <span
            className={`rounded-full px-2 py-1 text-xs ${
              connected ? 'bg-emerald-100 text-emerald-700' : 'bg-line text-muted'
            }`}
          >
            {connected ? 'connecté' : 'hors ligne'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:code" element={<LobbyPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/u/:pseudo" element={<PublicProfilePage />} />
          <Route path="/paint" element={<PaintPage />} />
        </Routes>
      </main>

      <Toast />
    </div>
  );
}

/** Notification éphémère (erreurs, gains d'XP). */
function Toast(): JSX.Element | null {
  const toast = useGameStore((s) => s.toast);
  const setToast = useGameStore((s) => s.setToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast, setToast]);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="animate-pop rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-pop">
        {toast}
      </div>
    </div>
  );
}
