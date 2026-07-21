import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EVENTS, GAME_MODES, LOBBY, type GameMode } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { Button, Card } from '../components/ui.js';
import { GamePage } from './GamePage.js';

const MODE_LABELS: Record<GameMode, string> = {
  classic: 'Classique',
  'everyone-seeks': 'Tout le monde cherche',
  coop: 'Coopératif',
  blitz: 'Blitz',
  ranked: 'Classé',
};

/** Salon d'attente : liste des joueurs, code partageable, mode, lancement (hôte). */
export function LobbyPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const room = useGameStore((s) => s.room);
  const myId = useGameStore((s) => s.playerId);

  // Si on arrive directement sur l'URL sans être dans le salon, on tente de rejoindre.
  useEffect(() => {
    if (code && (!room || room.code !== code)) {
      socket.emit(EVENTS.roomJoin, { code }, (res) => {
        if (!res.ok) navigate('/');
      });
    }
  }, [code, room, navigate]);

  if (!room) {
    return <p className="text-center text-muted">Connexion au salon…</p>;
  }

  // Partie en cours : on bascule sur l'écran de jeu.
  if (room.phase !== 'lobby') {
    return <GamePage room={room} />;
  }

  const me = room.players.find((p) => p.id === myId);
  const isHost = Boolean(me?.isHost);

  const leave = () => {
    socket.emit(EVENTS.roomLeave);
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-7">
      <Card className="flex items-center justify-between p-5">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            Code du salon
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal ${
                room.visibility === 'public'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gold-soft text-gold'
              }`}
            >
              {room.visibility === 'public' ? '🌍 Public' : '🔒 Privé'}
            </span>
          </div>
          <div className="font-display text-4xl font-bold tracking-[0.28em] text-ink">
            {room.code}
          </div>
          <div className="mt-1 text-xs text-muted">
            {room.visibility === 'public'
              ? 'Visible dans la liste des parties publiques.'
              : 'Partage-le pour inviter tes amis.'}
          </div>
        </div>
        <Button variant="ghost" onClick={leave}>
          Quitter
        </Button>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Mode de jeu
        </h2>
        <div className="flex flex-wrap gap-2">
          {GAME_MODES.map((m) => {
            const active = room.mode === m;
            return (
              <button
                key={m}
                disabled={!isHost}
                onClick={() => socket.emit(EVENTS.roomSetMode, { mode: m }, () => undefined)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'border border-line text-muted hover:border-muted/40 disabled:hover:border-line'
                } ${!isHost ? 'cursor-default' : ''}`}
              >
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>
        {!isHost && <p className="mt-1 text-xs text-muted">Seul l’hôte peut changer le mode.</p>}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Joueurs ({room.players.length}/{LOBBY.maxPlayers})
        </h2>
        <ul className="space-y-2">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                p.connected ? 'border-line bg-surface' : 'border-line bg-canvas opacity-60'
              }`}
            >
              <span className="font-medium">
                {p.pseudo}
                {p.id === myId && <span className="ml-2 text-xs text-accent">(toi)</span>}
                {!p.connected && <span className="ml-2 text-xs text-muted">déconnecté…</span>}
              </span>
              {p.isHost && <span className="text-xs text-muted">hôte</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <Button
          disabled={room.players.length < LOBBY.minPlayers}
          className="w-full py-3.5 text-base"
          onClick={() => socket.emit(EVENTS.roomStart, () => undefined)}
        >
          {room.players.length < LOBBY.minPlayers ? 'En attente de joueurs…' : 'Lancer la partie'}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted">En attente du lancement par l’hôte…</p>
      )}
    </div>
  );
}
