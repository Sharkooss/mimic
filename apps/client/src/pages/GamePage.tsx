import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  EVENTS,
  type CamouflageBreakdown,
  type RoomSnapshot,
  type RoundReveal,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { useCharacterStore } from '../store/characterStore.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { loadCharacterBase } from '../paint/character.js';
import { CamouflageStage } from '../paint/CamouflageStage.js';
import { BoardPaintStage } from '../paint/BoardPaintStage.js';
import { SeekerStage } from '../paint/SeekerStage.js';
import { ResultsStage } from '../paint/ResultsStage.js';

/**
 * Écran de partie (ossature — issue #7).
 * Affiche la phase courante, le compte à rebours, le rôle et l'œuvre.
 * Le contenu jouable (peinture #8, recherche #9, scoring #10) viendra remplir
 * les zones de chaque phase.
 */
export function GamePage({ room }: { room: RoomSnapshot }): JSX.Element {
  const remaining = useCountdown(room.phaseEndsAt);
  const results = useGameStore((s) => s.results);
  const myId = useGameStore((s) => s.playerId);
  const isSeeker = room.seekerId === myId;
  const totalHiders = Math.max(0, room.players.length - 1);

  return (
    <div className="space-y-6">
      <PhaseHeader room={room} remaining={remaining} />

      {room.phase === 'camouflage' && (
        <PhaseCard>
          {isSeeker ? (
            <>
              <div>
                <div className="font-semibold">Tu es le chercheur 🔍</div>
                <p className="text-sm text-stone-500">
                  Observe l’œuvre et mémorise les cachettes possibles. La traque commence bientôt.
                </p>
              </div>
              {room.artwork && (
                <SeekerStage artwork={room.artwork} interactive={false} totalHiders={totalHiders} />
              )}
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
            room.artwork ? (
              <SeekerStage artwork={room.artwork} interactive totalHiders={totalHiders} />
            ) : (
              <Waiting text="En attente de l’œuvre…" />
            )
          ) : (
            <>
              <Waiting text="Reste immobile et prie pour ne pas être repéré…" />
              <ArtworkCard room={room} />
            </>
          )}
        </PhaseCard>
      )}

      {room.phase === 'results' && (
        <PhaseCard>
          <h2 className="text-lg font-semibold">Résultats de la manche</h2>
          {room.artwork && results?.reveals?.length ? (
            <ResultsStage artwork={room.artwork} reveals={results.reveals} />
          ) : null}
          <Scoreboard room={room} roundScores={results?.scores} reveals={results?.reveals} />
        </PhaseCard>
      )}

      {room.phase === 'finished' && <FinalStandings room={room} />}
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

/**
 * Camouflage côté caché (refonte #35). Flux : se placer sur le tableau →
 * verrouiller la pose → peindre en contexte sur le tableau → verrouiller le
 * camouflage (soumission + score). La pose reste re-modifiable jusqu'au
 * verrouillage final. Personnage partagé via le store.
 */
function HiderCamouflage({ room }: { room: RoomSnapshot }) {
  const [step, setStep] = useState<'place' | 'paint'>('place');
  const [breakdown, setBreakdown] = useState<CamouflageBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useCharacterStore((s) => s.locked);

  // Nouveau tableau à chaque manche → personnage réinitialisé (avant le montage des enfants).
  const resetRound = useRef<number | null>(null);
  if (resetRound.current !== room.round) {
    resetRound.current = room.round;
    useCharacterStore.getState().reset();
    setStep('place');
    setBreakdown(null);
    setError(null);
  }

  // Charge la silhouette de base dès la manche (pour la placer avant de peindre).
  useEffect(() => {
    const st = useCharacterStore.getState();
    if (st.pixels && st.mask) return;
    let alive = true;
    loadCharacterBase()
      .then(({ mask, pixels }) => {
        if (alive && !useCharacterStore.getState().pixels) {
          useCharacterStore.getState().setBase(mask, pixels);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [room.round]);

  const lock = () => {
    const st = useCharacterStore.getState();
    if (!st.pixels) return setError("Peins d'abord ton personnage.");
    setError(null);
    socket.emit(
      EVENTS.characterLock,
      { placement: { x: st.x, y: st.y, rotation: st.rotation }, pixels: Array.from(st.pixels) },
      (res) => {
        if (res.ok) {
          setBreakdown(res.breakdown);
          useCharacterStore.getState().setLocked(true);
        } else {
          setError(res.error);
        }
      },
    );
  };

  return (
    <>
      <div>
        <div className="font-semibold">Camoufle-toi !</div>
        <p className="text-sm text-stone-500">
          {step === 'place'
            ? 'Place ton personnage sur le tableau, puis verrouille ta pose.'
            : 'Capture les couleurs du tableau (pipette 💧 ou palette 🎨) et peins ton personnage pour disparaître.'}
        </p>
      </div>

      <ol className="flex items-center gap-2 text-sm">
        <StepPill n={1} label="Placer" active={step === 'place'} done={step === 'paint'} />
        <span className="text-stone-300">→</span>
        <StepPill n={2} label="Peindre" active={step === 'paint'} done={locked} />
      </ol>

      {!room.artwork ? null : step === 'place' ? (
        <>
          <CamouflageStage artwork={room.artwork} />
          <button
            onClick={() => setStep('paint')}
            className="w-full rounded-xl bg-accent py-3 font-semibold text-white transition hover:brightness-110"
          >
            🔒 Verrouiller ma pose et peindre
          </button>
        </>
      ) : (
        <>
          <BoardPaintStage artwork={room.artwork} />
          {locked && breakdown ? (
            <BreakdownPanel breakdown={breakdown} />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep('place')}
                className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium hover:border-stone-300"
              >
                ← Repositionner
              </button>
              <button
                onClick={lock}
                className="flex-1 rounded-xl bg-accent py-3 font-semibold text-white transition hover:brightness-110"
              >
                🔒 Verrouiller mon camouflage
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}

      <ArtworkCard room={room} />
    </>
  );
}

function StepPill({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${
        active
          ? 'bg-accent text-white'
          : done
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-stone-100 text-stone-500'
      }`}
    >
      <span className="font-mono">{done && !active ? '✓' : n}</span>
      {label}
    </li>
  );
}

/** Décomposition du score de camouflage après verrouillage. */
function BreakdownPanel({ breakdown }: { breakdown: CamouflageBreakdown }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-emerald-800">Camouflage verrouillé ✓</span>
        <span className="font-mono text-3xl font-bold text-emerald-700">{breakdown.score}%</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <Metric label="Couleurs" value={breakdown.colorMatch} />
        <Metric label="Contours" value={breakdown.edgeMatch} />
        <Metric label="Contraste" value={breakdown.contrast} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/70 py-2">
      <div className="font-mono text-lg font-semibold">{value}%</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
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

/** Classement final soigné : podium + classement complet (#22). */
function FinalStandings({ room }: { room: RoomSnapshot }) {
  const myId = useGameStore((s) => s.playerId);
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const podium = ranked.slice(0, 3);
  const order = [1, 0, 2]; // 2e, 1er, 3e (1er au centre, surélevé)
  const heights = ['h-20', 'h-28', 'h-16'];
  const medals = ['🥈', '🥇', '🥉'];

  return (
    <div className="animate-slide-up space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <div className="text-center">
        <div className="text-3xl">🏆</div>
        <h2 className="mt-1 text-xl font-bold">Partie terminée</h2>
        {ranked[0] && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-accent">{ranked[0].pseudo}</span> remporte la partie
            avec {ranked[0].score} points !
          </p>
        )}
      </div>

      <div className="flex items-end justify-center gap-3">
        {order.map((oi, i) => {
          const p = podium[oi];
          if (!p) return <div key={i} className="w-24" />;
          return (
            <div key={p.id} className="flex w-24 flex-col items-center">
              <div className="text-2xl">{medals[oi]}</div>
              <div className="max-w-full truncate text-sm font-medium">{p.pseudo}</div>
              <div className="font-mono text-xs text-muted">{p.score}</div>
              <div
                className={`mt-1 w-full rounded-t-lg ${heights[oi]} ${
                  oi === 1 ? 'bg-accent' : 'bg-accent-soft'
                }`}
              />
            </div>
          );
        })}
      </div>

      {ranked.length > 3 && (
        <ol className="space-y-2">
          {ranked.slice(3).map((p, i) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-line px-4 py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="w-5 text-center font-mono text-muted">{i + 4}</span>
                <span className="font-medium">
                  {p.pseudo}
                  {p.id === myId && <span className="ml-2 text-xs text-accent">(toi)</span>}
                </span>
              </span>
              <span className="font-mono font-semibold">{p.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex justify-center">
        <Link
          to="/"
          className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold transition hover:border-muted/40"
        >
          Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}

function Scoreboard({
  room,
  roundScores,
  reveals,
}: {
  room: RoomSnapshot;
  roundScores?: Array<{
    playerId: string;
    pseudo: string;
    roundPoints: number;
    totalScore: number;
  }>;
  reveals?: RoundReveal[];
}) {
  const rows =
    roundScores ??
    [...room.players]
      .map((p) => ({ playerId: p.id, pseudo: p.pseudo, roundPoints: 0, totalScore: p.score }))
      .sort((a, b) => b.totalScore - a.totalScore);
  const revealById = new Map((reveals ?? []).map((r) => [r.playerId, r]));
  const myId = useGameStore.getState().playerId;

  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const rev = revealById.get(r.playerId);
        const isSeeker = r.playerId === room.seekerId;
        return (
          <li
            key={r.playerId}
            className="flex items-center justify-between rounded-lg border border-stone-100 px-4 py-2"
          >
            <span className="flex items-center gap-3">
              <span className="w-5 text-center font-mono text-stone-400">{i + 1}</span>
              <span className="font-medium">
                {r.pseudo}
                {r.playerId === myId && <span className="ml-2 text-xs text-accent">(toi)</span>}
              </span>
              {isSeeker ? (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                  🔍 chercheur
                </span>
              ) : rev ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    rev.found ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {rev.found ? 'trouvé' : 'échappé'}
                  {rev.camouflageScore != null ? ` · 🎨 ${rev.camouflageScore}%` : ''}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-3 font-mono">
              {r.roundPoints > 0 && <span className="text-emerald-600">+{r.roundPoints}</span>}
              <span className="font-semibold">{r.totalScore}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
