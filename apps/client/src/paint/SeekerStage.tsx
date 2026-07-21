import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_SIZE,
  EVENTS,
  WRONG_CLICK_COOLDOWN_MS,
  type Artwork,
  type PlayerFoundReveal,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { PixelSprite } from './PixelSprite.js';
import { artworkBg } from './artworkBg.js';
import { Burst, Ripple } from '../components/effects.js';

const S = CHARACTER_SIZE;
const CLICK_MOVE_THRESHOLD = 6;
const CURSOR_EMIT_MS = 45;

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Plateau du chercheur, plein écran : l'œuvre remplit tout l'espace disponible
 * avec les personnages cachés camouflés dessus ; au chercheur de les repérer et
 * de cliquer. Un raté impose un cooldown. Les trouvés sont surlignés.
 */
export function SeekerStage({
  artwork,
  interactive,
  totalHiders,
}: {
  artwork: Artwork;
  interactive: boolean;
  totalHiders: number;
}): JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const targets = useGameStore((s) => s.seekerTargets);
  // Curseur du chercheur relayé par le serveur : montré aux joueurs qui regardent
  // la traque (jamais au chercheur lui-même, qui voit son vrai curseur).
  const remoteCursor = useGameStore((s) => s.seekerCursor);
  const lastCursor = useRef(0);

  const [vp, setVp] = useState({ w: 960, h: 640 });
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [foundIds, setFoundIds] = useState<Set<string>>(new Set());
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // Impact d'un clic, en coordonnées écran (relatives au plateau) : anime onde,
  // particules et libellé flottant pile à l'endroit cliqué.
  const [impact, setImpact] = useState<{ ok: boolean; x: number; y: number; key: number } | null>(
    null,
  );

  // Le plateau épouse son conteneur (plein écran, pas de scroll).
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = useMemo(
    () => Math.min(vp.w / artwork.width, vp.h / artwork.height),
    [vp.w, vp.h, artwork.width, artwork.height],
  );
  const scale = fitScale * cam.zoom;

  // Reset trouvailles à chaque œuvre (nouvelle manche).
  useEffect(() => {
    setFoundIds(new Set());
    setCooldownUntil(0);
    setImpact(null);
    setCam({ zoom: 1, x: 0, y: 0 });
  }, [artwork.id]);

  // Secoue brièvement le plateau (impact d'un clic). Redémarrage fiable via reflow.
  const shakeBoard = () => {
    const el = outerRef.current;
    if (!el) return;
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
  };

  // Caméra centrée tant qu'on n'a pas zoomé (suit aussi le redimensionnement).
  useEffect(() => {
    setCam((c) =>
      c.zoom === 1
        ? {
            zoom: 1,
            x: (vp.w - artwork.width * fitScale) / 2,
            y: (vp.h - artwork.height * fitScale) / 2,
          }
        : c,
    );
  }, [artwork.id, vp.w, vp.h, fitScale, artwork.width, artwork.height]);

  // Marque les cachés trouvés (diffusé à toute la salle).
  useEffect(() => {
    const onFound = (data: PlayerFoundReveal) => {
      setFoundIds((s) => new Set(s).add(data.playerId));
    };
    socket.on(EVENTS.playerFound, onFound);
    return () => {
      socket.off(EVENTS.playerFound, onFound);
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownLeft = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownLeft > 0;

  const drag = useRef<{ cx: number; cy: number; px: number; py: number; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { cx: e.clientX, cy: e.clientY, px: cam.x, py: cam.y, moved: false };
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const emitCursor = (clientX: number, clientY: number) => {
    if (!interactive) return;
    const now = Date.now();
    if (now - lastCursor.current < CURSOR_EMIT_MS) return;
    lastCursor.current = now;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ax = (clientX - rect.left - cam.x) / scale;
    const ay = (clientY - rect.top - cam.y) / scale;
    socket.emit(EVENTS.seekerCursor, { x: ax, y: ay });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    emitCursor(e.clientX, e.clientY);
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= CLICK_MOVE_THRESHOLD) return;
    d.moved = true;
    setCam((c) => ({ ...c, x: d.px + dx, y: d.py + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && interactive) attemptFind(e.clientX, e.clientY);
  };

  const attemptFind = (clientX: number, clientY: number) => {
    if (onCooldown) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = clientX - rect.left; // point de clic en coords écran (plateau)
    const sy = clientY - rect.top;
    const ax = (sx - cam.x) / scale;
    const ay = (sy - cam.y) / scale;
    socket.emit(EVENTS.seekerClick, { x: ax, y: ay }, (res) => {
      if (!res.ok) return;
      const ok = res.hit;
      setImpact({ ok, x: sx, y: sy, key: Date.now() });
      shakeBoard();
      if (!ok) {
        setCooldownUntil(Date.now() + WRONG_CLICK_COOLDOWN_MS);
        setNow(Date.now());
      }
    });
  };

  // Retire l'impact après l'animation (les effets se démontent proprement).
  useEffect(() => {
    if (!impact) return;
    const t = setTimeout(() => setImpact(null), 1100);
    return () => clearTimeout(t);
  }, [impact]);

  const zoomBy = (factor: number, px: number, py: number) => {
    setCam((c) => {
      const z = Math.max(1, Math.min(artwork.maxZoom, c.zoom * factor));
      const s0 = fitScale * c.zoom;
      const s1 = fitScale * z;
      if (s0 === 0) return c;
      return { zoom: z, x: px - ((px - c.x) * s1) / s0, y: py - ((py - c.y) * s1) / s0 };
    });
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  };

  const cursor = interactive ? (onCooldown ? 'not-allowed' : 'crosshair') : 'grab';
  const shown = interactive ? targets : [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-4 text-sm">
        <span className="font-semibold">
          {interactive
            ? '🔍 Repère les personnages fondus dans la toile et clique dessus (raté = 3 s d’attente)'
            : '👀 Observe l’œuvre et mémorise les cachettes possibles'}
        </span>
        {interactive && (
          <span className="font-mono text-muted">
            Trouvés{' '}
            <span
              key={foundIds.size}
              className="animate-pop-in inline-block font-bold text-emerald-600"
            >
              {foundIds.size}
            </span>
            /{totalHiders}
          </span>
        )}
      </div>

      <div ref={outerRef} className="relative min-h-0 flex-1 overflow-hidden bg-night-800">
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          className="absolute inset-0"
          style={{ touchAction: 'none', cursor }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: artwork.width * fitScale,
              height: artwork.height * fitScale,
              transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`,
              background: artworkBg(artwork),
            }}
          >
            {/* Cachés camouflés (le chercheur doit les repérer) */}
            {shown.map((t) => {
              const isFound = foundIds.has(t.id);
              return (
                <div
                  key={t.id}
                  className="pointer-events-none absolute"
                  style={{
                    left: t.x * fitScale,
                    top: t.y * fitScale,
                    width: S * fitScale,
                    height: S * fitScale,
                  }}
                >
                  <PixelSprite pixels={t.pixels} size={S * fitScale} rotation={t.rotation} />
                  {isFound && (
                    <>
                      {/* Halo qui pulse pour attirer l'œil sur la capture */}
                      <span
                        className="animate-pulse-ring absolute left-1/2 top-1/2 rounded-full border-2 border-emerald-400"
                        style={{ width: S * fitScale, height: S * fitScale }}
                      />
                      <span className="animate-pop-in absolute inset-0 rounded-sm ring-2 ring-emerald-400" />
                      <span className="animate-pop-in absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white shadow-soft">
                        ✓
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {!interactive && remoteCursor && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1 -translate-y-1 transition-[left,top] duration-75 ease-linear"
              style={{ left: cam.x + remoteCursor.x * scale, top: cam.y + remoteCursor.y * scale }}
            >
              {/* Halo pulsant qui suit le chercheur : rend la traque « vivante » */}
              <span className="animate-pulse-ring absolute left-2 top-2 h-8 w-8 rounded-full border-2 border-gold" />
              <svg width="26" height="26" viewBox="0 0 24 24" className="relative drop-shadow-md">
                <path
                  d="M5 3l14 8-6 1.5L9.5 19 5 3z"
                  fill="#f59e0b"
                  stroke="#1c1917"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="ml-4 whitespace-nowrap rounded bg-gold/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                🔍 chercheur
              </span>
            </div>
          )}

          {/* Impact d'un clic : onde + particules + libellé flottant, pile au clic */}
          {impact && (
            <div
              key={impact.key}
              className="pointer-events-none absolute z-30"
              style={{ left: impact.x, top: impact.y }}
            >
              <Ripple
                x={0}
                y={0}
                color={impact.ok ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.85)'}
              />
              {impact.ok && <Burst x={0} y={0} count={14} />}
              <span
                className={`animate-float-up absolute left-0 top-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-pop ${
                  impact.ok ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              >
                {impact.ok ? 'Trouvé ! 🎯' : 'Raté…'}
              </span>
            </div>
          )}

          {onCooldown && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-red-500/90 px-4 py-1 font-mono text-sm text-white">
                ⏳ {(cooldownLeft / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-surface/90 p-1 shadow-soft">
            <HudBtn onClick={() => zoomBy(1 / 1.3, vp.w / 2, vp.h / 2)}>−</HudBtn>
            <span className="w-9 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
            <HudBtn onClick={() => zoomBy(1.3, vp.w / 2, vp.h / 2)}>+</HudBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function HudBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid h-8 min-w-8 place-items-center rounded-md border border-line bg-surface px-2 text-sm transition hover:border-muted/40"
    >
      {children}
    </button>
  );
}
