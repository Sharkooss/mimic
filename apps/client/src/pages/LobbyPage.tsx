import { useEffect, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Globe, Lock, Palette, Search } from 'lucide-react';
import {
  EVENTS,
  GAME_MODES,
  LOBBY,
  MODE_META,
  PHASE_BOUNDS,
  type RoomSettings,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { Button, Card } from '../components/ui.js';
import { GamePage } from './GamePage.js';

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
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal ${
                room.visibility === 'public'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gold-soft text-gold'
              }`}
            >
              {room.visibility === 'public' ? (
                <>
                  <Globe className="h-3 w-3" /> Public
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" /> Privé
                </>
              )}
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
            const meta = MODE_META[m];
            const active = room.mode === m;
            const locked = !meta.implemented;
            return (
              <button
                key={m}
                disabled={!isHost || locked}
                title={locked ? meta.blurb : undefined}
                onClick={() => socket.emit(EVENTS.roomSetMode, { mode: m }, () => undefined)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'border border-line text-muted hover:border-muted/40 disabled:hover:border-line'
                } ${locked ? 'cursor-not-allowed opacity-50' : !isHost ? 'cursor-default' : ''}`}
              >
                {meta.label}
                {locked && (
                  <span className="rounded-full bg-line px-1.5 py-px text-[9px] uppercase tracking-wide text-muted">
                    bientôt
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{MODE_META[room.mode].blurb}</p>
        {!isHost && <p className="mt-1 text-xs text-muted">Seul l’hôte peut changer le mode.</p>}
      </div>

      <SettingsPanel settings={room.settings} isHost={isHost} />

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

/**
 * Réglages de durées (temps de camouflage / de recherche). L'hôte les ajuste au
 * curseur ; les valeurs sont poussées au serveur en direct et diffusées à tous.
 * Les autres joueurs les voient en lecture seule.
 */
function SettingsPanel({ settings, isHost }: { settings: RoomSettings; isHost: boolean }) {
  const update = (patch: Partial<RoomSettings>) =>
    socket.emit(EVENTS.roomSetSettings, patch, () => undefined);

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Réglages de la partie
      </h2>
      <Card className="space-y-4 p-5">
        <SettingSlider
          label={
            <>
              <Palette className="h-4 w-4 text-muted" /> Temps de camouflage
            </>
          }
          value={settings.camouflageSec}
          min={PHASE_BOUNDS.camouflage.min}
          max={PHASE_BOUNDS.camouflage.max}
          disabled={!isHost}
          onChange={(camouflageSec) => update({ camouflageSec })}
        />
        <SettingSlider
          label={
            <>
              <Search className="h-4 w-4 text-muted" /> Temps de recherche
            </>
          }
          value={settings.seekingSec}
          min={PHASE_BOUNDS.seeking.min}
          max={PHASE_BOUNDS.seeking.max}
          disabled={!isHost}
          onChange={(seekingSec) => update({ seekingSec })}
        />
        {!isHost && <p className="text-xs text-muted">Seul l’hôte peut changer les réglages.</p>}
      </Card>
    </div>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">{label}</span>
        <span className="font-mono text-sm tabular-nums text-accent">
          {value}
          <span className="ml-0.5 text-xs text-muted">s</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-muted">
        <span>{min}s</span>
        <span>{max}s</span>
      </div>
    </div>
  );
}
