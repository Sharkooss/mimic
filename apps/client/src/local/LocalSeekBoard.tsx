import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, Target, Timer } from 'lucide-react';
import {
  CHARACTER_SIZE,
  WRONG_CLICK_COOLDOWN_MS,
  characterHit,
  type Artwork,
  type CharacterRotation,
} from '@mimic/shared';
import { PixelSprite } from '../paint/PixelSprite.js';
import { artworkBg } from '../paint/artworkBg.js';
import { Burst, Ripple } from '../components/effects.js';
import { HintOverlay } from '../paint/HintOverlay.js';
import { computeHintZones, hintRadius } from '../paint/hintZones.js';

const S = CHARACTER_SIZE;
const CLICK_MOVE_THRESHOLD = 6;

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

export interface HiddenCharacter {
  x: number;
  y: number;
  rotation: CharacterRotation;
  pixels: number[];
}

/**
 * Plateau de recherche du mode local (hot-seat) : l'œuvre remplit l'espace, le
 * personnage caché y est peint. Le chercheur clique pour le trouver (hitbox au
 * pixel près, un raté impose un cooldown). Autonome — aucune socket.
 */
export function LocalSeekBoard({
  artwork,
  character,
  found,
  onFound,
  elapsedFrac = null,
}: {
  artwork: Artwork;
  character: HiddenCharacter;
  found: boolean;
  onFound: () => void;
  /** Fraction du temps écoulée → zone d'indice qui se resserre. */
  elapsedFrac?: number | null;
}): JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 960, h: 640 });
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [impact, setImpact] = useState<{ ok: boolean; x: number; y: number; key: number } | null>(
    null,
  );

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

  // Caméra centrée tant qu'on n'a pas zoomé.
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
  }, [vp.w, vp.h, fitScale, artwork.width, artwork.height]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  useEffect(() => {
    if (!impact) return;
    const t = setTimeout(() => setImpact(null), 1100);
    return () => clearTimeout(t);
  }, [impact]);

  const cooldownLeft = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownLeft > 0;

  const shakeBoard = () => {
    const el = outerRef.current;
    if (!el) return;
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
  };

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
    if (d && !d.moved && !found) attemptFind(e.clientX, e.clientY);
  };

  const attemptFind = (clientX: number, clientY: number) => {
    if (onCooldown || found) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const ax = (sx - cam.x) / scale;
    const ay = (sy - cam.y) / scale;
    const hit = characterHit(
      character.pixels,
      character.x,
      character.y,
      character.rotation,
      ax,
      ay,
    );
    setImpact({ ok: hit, x: sx, y: sy, key: Date.now() });
    shakeBoard();
    if (hit) {
      onFound();
    } else {
      setCooldownUntil(Date.now() + WRONG_CLICK_COOLDOWN_MS);
      setNow(Date.now());
    }
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

  const cursor = found ? 'default' : onCooldown ? 'not-allowed' : 'crosshair';
  const charDisp = S * fitScale;

  // Zone d'indice (après HINT_START_FRAC, tant que non trouvé).
  const hintR = !found && elapsedFrac != null ? hintRadius(elapsedFrac, artwork) : null;
  const hintZones =
    hintR != null ? computeHintZones([{ id: 'local', x: character.x, y: character.y }], hintR) : [];

  return (
    <div ref={outerRef} className="relative h-full w-full overflow-hidden bg-night-800">
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
          <div
            className="pointer-events-none absolute"
            style={{
              left: character.x * fitScale,
              top: character.y * fitScale,
              width: charDisp,
              height: charDisp,
            }}
          >
            <PixelSprite pixels={character.pixels} size={charDisp} rotation={character.rotation} />
            {found && (
              <>
                <span
                  className="animate-pulse-ring absolute left-1/2 top-1/2 rounded-full border-2 border-emerald-400"
                  style={{ width: charDisp, height: charDisp }}
                />
                <span className="animate-pop-in absolute inset-0 rounded-sm ring-2 ring-emerald-400" />
                <span className="animate-pop-in absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-soft">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </>
            )}
          </div>
        </div>

        {/* Zone d'indice « projecteur » */}
        <HintOverlay zones={hintZones} camX={cam.x} camY={cam.y} scale={scale} />

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
              className={`animate-float-up absolute left-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-pop ${
                impact.ok ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            >
              {impact.ok ? (
                <>
                  <Target className="h-4 w-4" /> Trouvé !
                </>
              ) : (
                'Raté…'
              )}
            </span>
          </div>
        )}

        {onCooldown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-4 py-1 font-mono text-sm text-white">
              <Timer className="h-4 w-4" /> {(cooldownLeft / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-surface/90 p-1 shadow-soft">
          <HudBtn onClick={() => zoomBy(1 / 1.3, vp.w / 2, vp.h / 2)}>
            <Minus className="h-4 w-4" />
          </HudBtn>
          <span className="w-9 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
          <HudBtn onClick={() => zoomBy(1.3, vp.w / 2, vp.h / 2)}>
            <Plus className="h-4 w-4" />
          </HudBtn>
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
