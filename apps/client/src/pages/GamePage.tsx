import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  EyeOff,
  MapPin,
  Medal,
  Palette,
  Search,
  Star,
  Timer,
  Trophy,
  VenetianMask,
} from 'lucide-react';
import { CHARACTER_SIZE, type CoHider, type RoomSnapshot, type RoundReveal } from '@mimic/shared';
import { useGameStore } from '../store/gameStore.js';
import { useCharacterStore } from '../store/characterStore.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { loadCharacterBase } from '../paint/character.js';
import { CamouflageBoard } from '../paint/CamouflageBoard.js';
import { SeekerStage } from '../paint/SeekerStage.js';
import { ResultsStage } from '../paint/ResultsStage.js';
import { Wordmark } from '../components/ui.js';
import { Confetti, CountUp } from '../components/effects.js';

const S = CHARACTER_SIZE;

/**
 * Écran de partie. Les phases jouables (camouflage, recherche) passent en plein
 * écran : tableau central maximisé, panneau d'infos à gauche, outils à droite,
 * scroll de page gelé. Le camouflage est validé automatiquement à la fin du
 * chrono (côté serveur) — aucun bouton de confirmation. Résultats et classement
 * final restent en flux normal.
 */
export function GamePage({ room }: { room: RoomSnapshot }): JSX.Element {
  const remaining = useCountdown(room.phaseEndsAt);
  const results = useGameStore((s) => s.results);
  const myId = useGameStore((s) => s.playerId);
  const seekerTargets = useGameStore((s) => s.seekerTargets);
  const coHiders = useGameStore((s) => s.coHiders);
  const isSeeker = room.seekerId === myId;
  const totalHiders = Math.max(0, room.players.length - 1);
  const fullscreen = room.phase === 'camouflage' || room.phase === 'seeking';

  // Focus caméra demandé depuis la liste des cachés (clic sur un joueur).
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null);

  // Plein écran de jeu : on gèle le scroll de la page derrière l'overlay.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  if (fullscreen) {
    const isHiderSeeking = room.phase === 'seeking' && !isSeeker;
    // Cibles pour le chercheur, co-cachés pour un caché, rien pendant l'observation.
    const stagePlayers = room.phase === 'seeking' ? (isSeeker ? seekerTargets : coHiders) : [];
    const roster = isHiderSeeking ? coHiders : [];

    return (
      <div className="fixed inset-0 z-50 flex bg-canvas">
        <GameSidebar
          room={room}
          remaining={remaining}
          isSeeker={isSeeker}
          roster={roster}
          myId={myId}
          onFocus={(x, y) => setFocus({ x, y, key: Date.now() })}
        />
        <main className="min-w-0 flex-1">
          {!room.artwork ? (
            <Waiting text="En attente de l’œuvre…" />
          ) : room.phase === 'camouflage' && !isSeeker ? (
            <HiderBoard room={room} artworkId={room.artwork.id} />
          ) : (
            <SeekerStage
              artwork={room.artwork}
              interactive={room.phase === 'seeking' && isSeeker}
              totalHiders={totalHiders}
              players={stagePlayers}
              showLabels={isHiderSeeking}
              myId={myId}
              focusTarget={focus}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PhaseHeader room={room} remaining={remaining} />

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

/**
 * Plateau du caché : réinitialise le personnage à chaque manche (avant le
 * montage des enfants) et charge la silhouette de base. La validation est
 * automatique en fin de chrono — le serveur garde le dernier état relayé.
 */
function HiderBoard({ room, artworkId }: { room: RoomSnapshot; artworkId: string }) {
  const resetRound = useRef<number | null>(null);
  if (resetRound.current !== room.round) {
    resetRound.current = room.round;
    useCharacterStore.getState().reset();
  }

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

  return <CamouflageBoard key={artworkId} artwork={room.artwork!} live />;
}

/** Colonne d'infos du plein écran : manche, chrono, consigne, œuvre, roster. */
function GameSidebar({
  room,
  remaining,
  isSeeker,
  roster,
  myId,
  onFocus,
}: {
  room: RoomSnapshot;
  remaining: number | null;
  isSeeker: boolean;
  roster: CoHider[];
  myId: string | null;
  onFocus: (x: number, y: number) => void;
}) {
  const camo = room.phase === 'camouflage';
  const a = room.artwork;
  const urgent = remaining != null && remaining <= 10;

  const consigne: { Icon: ComponentType<{ className?: string }>; title: string; text: string } =
    camo
      ? isSeeker
        ? {
            Icon: Search,
            title: 'Tu es le chercheur',
            text: 'Observe l’œuvre et mémorise les cachettes possibles. La traque commence à la fin du chrono.',
          }
        : {
            Icon: Palette,
            title: 'Camoufle-toi !',
            text: 'Place ton personnage puis peins-le pour le fondre dans l’œuvre. Espace = pipette pour capturer les couleurs.',
          }
      : isSeeker
        ? {
            Icon: Search,
            title: 'À toi de jouer',
            text: 'Clique sur les personnages camouflés. Un raté impose 3 s d’attente.',
          }
        : {
            Icon: EyeOff,
            title: 'Ne bouge plus',
            text: 'Le chercheur scrute l’œuvre. Reste immobile et prie pour ne pas être repéré…',
          };

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-4">
      <Link to="/" className="transition hover:opacity-80">
        <Wordmark />
      </Link>

      <div>
        <div className="text-xs uppercase tracking-wide text-muted">
          Manche {Math.min(room.round + 1, room.totalRounds)} / {room.totalRounds}
        </div>
        <div className="text-xl font-bold">{camo ? 'Camouflage' : 'Recherche'}</div>
      </div>

      <div
        className={`rounded-xl border p-3 text-center font-mono text-4xl tabular-nums transition-colors ${
          urgent
            ? 'animate-heartbeat border-red-200 bg-red-50 text-red-600'
            : 'border-line bg-canvas text-accent'
        }`}
      >
        {formatTime(remaining)}
      </div>

      <div className="rounded-xl bg-accent-soft p-3 text-sm">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <consigne.Icon className="h-4 w-4 text-accent" />
          {consigne.title}
        </div>
        <p className="text-muted">{consigne.text}</p>
      </div>

      {/* Roster des cachés (clic = focus caméra) — visible entre cachés. */}
      {roster.length > 0 && (
        <div className="min-h-0 flex-1">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Cachés ({roster.length}) · clique pour zoomer
          </div>
          <ul className="space-y-1 overflow-y-auto">
            {roster.map((h) => {
              const isSelf = h.id === myId;
              return (
                <li key={h.id}>
                  <button
                    onClick={() => onFocus(h.x + S / 2, h.y + S / 2)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition hover:border-accent/40 hover:bg-accent-soft ${
                      isSelf ? 'border-gold/50 bg-gold-soft' : 'border-line bg-canvas'
                    }`}
                  >
                    {isSelf ? (
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gold" />
                    ) : (
                      <VenetianMask className="h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {h.pseudo}
                      {isSelf && <span className="ml-1 text-xs text-gold">(toi)</span>}
                    </span>
                    <Search className="h-3 w-3 shrink-0 text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {camo && !isSeeker && (
        <p className="flex items-start gap-1.5 rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-muted">
          <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Ton camouflage est{' '}
            <span className="font-semibold text-ink">validé automatiquement</span> à la fin du
            chrono — rien à confirmer.
          </span>
        </p>
      )}

      {a && (
        <div className="rounded-xl bg-canvas p-3 text-sm">
          <div className="font-semibold">{a.title}</div>
          <div className="mt-0.5 text-xs text-muted">
            {a.author} · {a.year}
          </div>
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${i < a.difficulty ? 'fill-gold text-gold' : 'text-line'}`}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function formatTime(remaining: number | null): string {
  if (remaining == null) return '--:--';
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
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
        <div className="font-mono text-3xl tabular-nums text-accent">{formatTime(remaining)}</div>
      )}
    </div>
  );
}

function PhaseCard({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">{children}</div>
  );
}

function Waiting({ text }: { text: string }) {
  return <p className="p-6 text-stone-600">{text}</p>;
}

/** Métadonnées de podium indexées par rang (0 = 1er). */
const PODIUM = [
  { color: 'text-gold fill-gold/25', height: 'h-28', bar: 'bg-accent shadow-pop', delay: '0s' },
  { color: 'text-stone-400 fill-stone-200', height: 'h-20', bar: 'bg-accent-soft', delay: '0.18s' },
  {
    color: 'text-amber-700 fill-amber-700/20',
    height: 'h-16',
    bar: 'bg-gold-soft',
    delay: '0.34s',
  },
];

/** Classement final : podium (1er au centre, or) + classement complet (#22). */
function FinalStandings({ room }: { room: RoomSnapshot }) {
  const myId = useGameStore((s) => s.playerId);
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const podium = ranked.slice(0, 3);
  // Ordre d'affichage gauche→droite : 2e, 1er (centre, surélevé), 3e.
  const order = podium.length >= 3 ? [1, 0, 2] : podium.length === 2 ? [1, 0] : [0];
  const winner = ranked[0];

  return (
    <div className="animate-slide-up space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <Confetti />
      <div className="text-center">
        <Trophy className="animate-pop-in mx-auto h-10 w-10 fill-gold/20 text-gold" />
        <h2 className="mt-1 text-xl font-bold">Partie terminée</h2>
        {winner && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-accent">{winner.pseudo}</span> remporte la partie
            avec{' '}
            <CountUp value={winner.score} className="font-semibold text-accent" duration={1100} />{' '}
            points !
          </p>
        )}
      </div>

      <div className="flex items-end justify-center gap-3">
        {order.map((rank) => {
          const p = podium[rank];
          if (!p) return null;
          const meta = PODIUM[rank]!;
          const isWinner = rank === 0;
          return (
            <div key={p.id} className="flex w-24 flex-col items-center">
              <div
                className={isWinner ? 'animate-wiggle' : ''}
                style={isWinner ? { animationIterationCount: 3 } : undefined}
              >
                <Medal className={`h-9 w-9 ${meta.color}`} />
              </div>
              <div className="max-w-full truncate text-sm font-medium">
                {p.pseudo}
                {p.id === myId && <span className="ml-1 text-xs text-accent">(toi)</span>}
              </div>
              <div className="font-mono text-xs text-muted">{p.score}</div>
              <div
                className={`animate-grow-bar mt-1 w-full origin-bottom rounded-t-lg ${meta.height} ${meta.bar}`}
                style={{ animationDelay: meta.delay }}
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
            className="animate-rise flex items-center justify-between rounded-lg border border-stone-100 px-4 py-2"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="flex items-center gap-3">
              <span className="w-5 text-center font-mono text-stone-400">{i + 1}</span>
              <span className="font-medium">
                {r.pseudo}
                {r.playerId === myId && <span className="ml-2 text-xs text-accent">(toi)</span>}
              </span>
              {isSeeker ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                  <Search className="h-3 w-3" /> chercheur
                </span>
              ) : rev ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    rev.found ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {rev.found ? 'trouvé' : 'échappé'}
                  {rev.camouflageScore != null && (
                    <>
                      · <Palette className="h-3 w-3" /> {rev.camouflageScore}%
                    </>
                  )}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-3 font-mono">
              {r.roundPoints > 0 && (
                <span
                  className="animate-pop-in font-semibold text-emerald-600"
                  style={{ animationDelay: `${i * 90 + 350}ms` }}
                >
                  +{r.roundPoints}
                </span>
              )}
              <span className="font-semibold">{r.totalScore}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
