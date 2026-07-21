import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const S = CHARACTER_SIZE;
const CLICK_MOVE_THRESHOLD = 6;

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Plateau du chercheur (issue #13, refonte). Affiche l'œuvre en grand (responsive)
 * avec les personnages cachés camouflés dessus : au chercheur de les repérer et de
 * cliquer. Un raté impose un cooldown. Les trouvés sont surlignés.
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

  const [availW, setAvailW] = useState(720);
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [foundIds, setFoundIds] = useState<Set<string>>(new Set());
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<{ ok: boolean; key: number } | null>(null);

  // Dimensions du plateau : remplit la largeur dispo, borné en hauteur (~72% écran).
  const ar = artwork.height / artwork.width;
  const maxH = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.72 : 720, 820);
  let boardW = Math.max(280, availW);
  let boardH = boardW * ar;
  if (boardH > maxH) {
    boardH = maxH;
    boardW = maxH / ar;
  }
  const fitScale = boardW / artwork.width;
  const scale = fitScale * cam.zoom;

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setAvailW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset caméra + trouvailles à chaque œuvre (nouvelle manche).
  useEffect(() => {
    setCam({ zoom: 1, x: 0, y: 0 });
    setFoundIds(new Set());
    setCooldownUntil(0);
    setFlash(null);
  }, [artwork.id]);

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
  const onPointerMove = (e: React.PointerEvent) => {
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
    const ax = (clientX - rect.left - cam.x) / scale;
    const ay = (clientY - rect.top - cam.y) / scale;
    socket.emit(EVENTS.seekerClick, { x: ax, y: ay }, (res) => {
      if (!res.ok) return setFlash({ ok: false, key: Date.now() });
      if (res.hit) {
        setFlash({ ok: true, key: Date.now() });
      } else {
        setFlash({ ok: false, key: Date.now() });
        setCooldownUntil(Date.now() + WRONG_CLICK_COOLDOWN_MS);
        setNow(Date.now());
      }
    });
  };

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
    <div ref={outerRef} className="w-full space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {interactive ? '🔍 Repère et clique les personnages cachés' : 'Observe l’œuvre'}
        </span>
        <span className="font-mono text-muted">
          Trouvés {foundIds.size}/{totalHiders}
        </span>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="relative mx-auto overflow-hidden rounded-xl2 border border-line bg-night-800 shadow-frame"
        style={{ width: boardW, height: boardH, touchAction: 'none', cursor }}
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
                className={`pointer-events-none absolute ${isFound ? 'rounded-sm ring-2 ring-emerald-400' : ''}`}
                style={{
                  left: t.x * fitScale,
                  top: t.y * fitScale,
                  width: S * fitScale,
                  height: S * fitScale,
                }}
              >
                <PixelSprite pixels={t.pixels} size={S * fitScale} rotation={t.rotation} />
                {isFound && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {flash && (
          <div
            key={flash.key}
            className={`animate-pop pointer-events-none absolute left-3 top-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${
              flash.ok ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            {flash.ok ? 'Trouvé ! 🎯' : 'Raté…'}
          </div>
        )}

        {onCooldown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full bg-red-500/90 px-4 py-1 font-mono text-sm text-white">
              ⏳ {(cooldownLeft / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-surface/90 p-1 shadow-soft">
          <HudBtn onClick={() => zoomBy(1 / 1.3, boardW / 2, boardH / 2)}>−</HudBtn>
          <span className="w-9 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
          <HudBtn onClick={() => zoomBy(1.3, boardW / 2, boardH / 2)}>+</HudBtn>
        </div>
      </div>

      <p className="text-xs text-muted">
        {interactive
          ? 'Repère les personnages fondus dans la toile et clique dessus. Un raté impose 3s d’attente. Glisse pour te déplacer, molette/boutons pour zoomer.'
          : 'Mémorise les cachettes possibles. La traque commence bientôt.'}
      </p>
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
