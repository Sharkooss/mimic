import { useState, type ReactNode } from 'react';
import type { RoomSnapshot } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { PaintEditor } from '../paint/PaintEditor.js';
import { CamouflageStage } from '../paint/CamouflageStage.js';

/**
 * Écran de partie (ossature — issue #7).
 * Affiche la phase courante, le compte à rebours, le rôle et l'œuvre.
 * Le contenu jouable (peinture #8, recherche #9, scoring #10) viendra remplir
 * les zones de chaque phase.
 */
export function GamePage({ room }: { room: RoomSnapshot }): JSX.Element {
  const remaining = useCountdown(room.phaseEndsAt);
  const results = useGameStore((s) => s.results);
  const isSeeker = room.seekerId === socket.id;

  return (
    <div className="space-y-6">
      <PhaseHeader room={room} remaining={remaining} />

      {room.phase === 'camouflage' && (
        <PhaseCard>
          {isSeeker ? (
            <>
              <Waiting text="Tu es le chercheur. Observe l'œuvre… la traque commence bientôt." />
              <ArtworkCard room={room} />
            </>
          ) : (
            <HiderCamouflage room={room} />
          )}
        </PhaseCard>
      )}

      {room.phase === 'seeking' && (
        <PhaseCard>
          {isSeeker ? (
            <Waiting text="À toi de jouer : trouve les cachés ! (vue chercheur — issue #9)" />
          ) : (
            <Waiting text="Reste immobile et prie pour ne pas être repéré…" />
          )}
          <ArtworkCard room={room} />
        </PhaseCard>
      )}

      {(room.phase === 'results' || room.phase === 'finished') && (
        <PhaseCard>
          <h2 className="text-lg font-semibold">
            {room.phase === 'finished' ? '🏆 Classement final' : 'Résultats de la manche'}
          </h2>
          <Scoreboard room={room} roundScores={results?.scores} />
        </PhaseCard>
      )}
    </div>
  );
}

function PhaseHeader({ room, remaining }: { room: RoomSnapshot; remaining: number | null }) {
  const label: Record<RoomSnapshot['phase'], string> = {
    lobby: 'Lobby',
    camouflage: 'Camouflage',
    seeking: 'Recherche',
    results: 'Résultats',
    finished: 'Partie terminée',
  };
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">
          Manche {Math.min(room.round + 1, room.totalRounds)} / {room.totalRounds}
        </div>
        <div className="text-2xl font-bold">{label[room.phase]}</div>
      </div>
      {remaining != null && (
        <div className="font-mono text-3xl tabular-nums text-accent">
          {String(Math.floor(remaining / 60)).padStart(2, '0')}:
          {String(remaining % 60).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}

/** Camouflage côté caché : onglets Peindre / Placer (personnage partagé via le store). */
function HiderCamouflage({ room }: { room: RoomSnapshot }) {
  const [tab, setTab] = useState<'paint' | 'place'>('paint');
  return (
    <>
      <div>
        <div className="font-semibold">Camoufle-toi !</div>
        <p className="text-sm text-stone-500">
          Peins ton personnage, puis place-le sur le tableau pour le rendre invisible.
        </p>
      </div>
      <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        <TabButton active={tab === 'paint'} onClick={() => setTab('paint')}>
          🖌 Peindre
        </TabButton>
        <TabButton active={tab === 'place'} onClick={() => setTab('place')}>
          🎯 Placer
        </TabButton>
      </div>
      {tab === 'paint' ? (
        <PaintEditor />
      ) : room.artwork ? (
        <CamouflageStage artwork={room.artwork} />
      ) : null}
      <ArtworkCard room={room} />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 transition ${
        active ? 'bg-white shadow-sm' : 'text-stone-500 hover:text-stone-700'
      }`}
    >
      {children}
    </button>
  );
}

function PhaseCard({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">{children}</div>
  );
}

function Waiting({ text }: { text: string }) {
  return <p className="text-stone-600">{text}</p>;
}

function ArtworkCard({ room }: { room: RoomSnapshot }) {
  if (!room.artwork) return null;
  const a = room.artwork;
  return (
    <div className="flex items-center gap-4 rounded-xl bg-stone-50 p-4">
      <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-stone-300 text-xs text-stone-400">
        {a.width}×{a.height}
      </div>
      <div>
        <div className="font-semibold">{a.title}</div>
        <div className="text-sm text-stone-500">
          {a.author} · {a.year} · {'★'.repeat(a.difficulty)}
          {'☆'.repeat(4 - a.difficulty)}
        </div>
      </div>
    </div>
  );
}

function Scoreboard({
  room,
  roundScores,
}: {
  room: RoomSnapshot;
  roundScores?: Array<{
    playerId: string;
    pseudo: string;
    roundPoints: number;
    totalScore: number;
  }>;
}) {
  const rows =
    roundScores ??
    [...room.players]
      .map((p) => ({ playerId: p.id, pseudo: p.pseudo, roundPoints: 0, totalScore: p.score }))
      .sort((a, b) => b.totalScore - a.totalScore);

  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={r.playerId}
          className="flex items-center justify-between rounded-lg border border-stone-100 px-4 py-2"
        >
          <span className="flex items-center gap-3">
            <span className="w-5 text-center font-mono text-stone-400">{i + 1}</span>
            <span className="font-medium">
              {r.pseudo}
              {r.playerId === socket.id && <span className="ml-2 text-xs text-accent">(toi)</span>}
            </span>
          </span>
          <span className="flex items-center gap-3 font-mono">
            {r.roundPoints > 0 && <span className="text-emerald-600">+{r.roundPoints}</span>}
            <span className="font-semibold">{r.totalScore}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
