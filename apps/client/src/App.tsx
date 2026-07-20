import { Routes, Route } from 'react-router-dom';
import { useSocket } from './hooks/useSocket.js';
import { useGameStore } from './store/gameStore.js';
import { HomePage } from './pages/HomePage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { PaintPage } from './pages/PaintPage.js';

export default function App(): JSX.Element {
  useSocket();
  const connected = useGameStore((s) => s.connected);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <span className="text-accent">●</span> Mimic
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'
          }`}
        >
          {connected ? 'connecté' : 'hors ligne'}
        </span>
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
