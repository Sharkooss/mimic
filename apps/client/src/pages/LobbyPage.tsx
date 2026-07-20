import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EVENTS } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';

/** Salon d'attente : liste des joueurs, code partageable, lancement (hôte). */
export function LobbyPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const room = useGameStore((s) => s.room);

  // Si on arrive directement sur l'URL sans être dans le salon, on tente de rejoindre.
  useEffect(() => {
    if (code && (!room || room.code !== code)) {
      socket.emit(EVENTS.roomJoin, { code }, (res) => {
        if (!res.ok) navigate('/');
      });
    }
  }, [code, room, navigate]);

  if (!room) {
    return <p className="text-center text-stone-500">Connexion au salon…</p>;
  }

  const me = room.players.find((p) => p.id === socket.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-stone-500">Code du salon</div>
          <div className="font-mono text-3xl font-bold tracking-[0.3em]">{room.code}</div>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-sm capitalize">{room.mode}</span>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Joueurs ({room.players.length}/{16})
        </h2>
        <ul className="space-y-2">
          {room.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <span className="font-medium">
                {p.pseudo}
                {p.id === socket.id && <span className="ml-2 text-xs text-accent">(toi)</span>}
              </span>
              {p.isHost && <span className="text-xs text-stone-400">hôte</span>}
            </li>
          ))}
        </ul>
      </div>

      {me?.isHost ? (
        <button
          disabled={room.players.length < 2}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40"
          onClick={() => socket.emit(EVENTS.roomStart, () => undefined)}
        >
          {room.players.length < 2 ? 'En attente de joueurs…' : 'Lancer la partie'}
        </button>
      ) : (
        <p className="text-center text-sm text-stone-500">En attente du lancement par l'hôte…</p>
      )}
    </div>
  );
}
