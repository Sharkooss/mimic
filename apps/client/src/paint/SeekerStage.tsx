import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_SIZE,
  EVENTS,
  WRONG_CLICK_COOLDOWN_MS,
  placeholderCss,
  type Artwork,
  type CharacterRotation,
  type PlayerFoundReveal,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { PixelSprite } from './PixelSprite.js';

const S = CHARACTER_SIZE;
const VIEW_W = 640;
const VIEW_H = 400;
/** Déplacement (px écran) au-delà duquel un geste est un pan, pas un clic. */
const CLICK_MOVE_THRESHOLD = 6;

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

interface Reveal {
  playerId: string;
  x: number;
  y: number;
  rotation: CharacterRotation;
  pixels: number[];
}

/**
 * Plateau du chercheur (issue #13).
 * Affiche l'œuvre (placeholder) avec caméra zoom/pan. En mode `interactive`
 * (phase de recherche), un clic tente de démasquer un caché ; un raté déclenche
 * un cooldown anti-spam. Les cachés trouvés sont révélés à leur cachette.
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScale = useMemo(
    () => Math.min(VIEW_W / artwork.width, VIEW_H / artwork.height),
    [artwork.width, artwork.height],
  );
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const scale = fitScale * cam.zoom;

  const [found, setFound] = useState<Reveal[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<{ ok: boolean; key: number } | null>(null);

  const drag = useRef<{
    cx: number;
    cy: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  // Centrage caméra + reset des trouvailles à chaque œuvre (nouvelle manche).
  useEffect(() => {
    setCam({
      zoom: 1,
      x: (VIEW_W - artwork.width * fitScale) / 2,
      y: (VIEW_H - artwork.height * fitScale) / 2,
    });
    setFound([]);
    setCooldownUntil(0);
    setFlash(null);
  }, [artwork.id, fitScale, artwork.width, artwork.height]);

  // Écoute des révélations (diffusées à toute la salle).
  useEffect(() => {
    const onFound = (data: PlayerFoundReveal) => {
      setFound((list) =>
        list.some((r) => r.playerId === data.playerId)
          ? list
          : [
              ...list,
              {
                playerId: data.playerId,
                x: data.placement.x,
                y: data.placement.y,
                rotation: data.placement.rotation,
                pixels: data.pixels,
              },
            ],
      );
    };
    socket.on(EVENTS.playerFound, onFound);
    return () => {
      socket.off(EVENTS.playerFound, onFound);
    };
  }, []);

  // Rafraîchit le décompte du cooldown tant qu'il court.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownLeft = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownLeft > 0;

  const capture = (e: React.PointerEvent) => {
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = {
      cx: e.clientX,
      cy: e.clientY,
      startPanX: cam.x,
      startPanY: cam.y,
      moved: false,
    };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    // Sous le seuil : on considère que le pointeur est immobile (futur clic).
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= CLICK_MOVE_THRESHOLD) return;
    d.moved = true;
    setCam((c) => ({ ...c, x: d.startPanX + dx, y: d.startPanY + dy }));
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
      if (!res.ok) {
        setFlash({ ok: false, key: Date.now() });
        return;
      }
      if (res.hit) {
        setFlash({ ok: true, key: Date.now() });
      } else {
        setFlash({ ok: false, key: Date.now() });
        setCooldownUntil(Date.now() + WRONG_CLICK_COOLDOWN_MS);
        setNow(Date.now());
      }
    });
  };

  /** Zoom multiplicatif autour d'un point (px,py) du viewport. État caméra atomique. */
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {interactive ? '🔍 À la recherche des cachés' : "Aperçu de l'œuvre"}
        </span>
        <span className="font-mono text-stone-500">
          Trouvés {found.length}/{totalHiders}
        </span>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="relative overflow-hidden rounded-xl border border-stone-300 bg-stone-100"
        style={{ width: VIEW_W, height: VIEW_H, touchAction: 'none', cursor }}
      >
        {/* Couche œuvre (placeholder) */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: artwork.width * fitScale,
            height: artwork.height * fitScale,
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`,
            background: placeholderCss(artwork.id),
          }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/40">
            <span className="text-2xl font-semibold">{artwork.title}</span>
          </div>
          {/* Cachés révélés */}
          {found.map((r) => (
            <div
              key={r.playerId}
              className="pointer-events-none absolute rounded-sm ring-2 ring-emerald-400"
              style={{
                left: r.x * fitScale,
                top: r.y * fitScale,
                width: S * fitScale,
                height: S * fitScale,
              }}
            >
              <PixelSprite pixels={r.pixels} size={S * fitScale} rotation={r.rotation} />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                ✓
              </span>
            </div>
          ))}
        </div>

        {/* Retour de clic */}
        {flash && (
          <div
            key={flash.key}
            className={`pointer-events-none absolute left-2 top-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${
              flash.ok ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            {flash.ok ? 'Trouvé ! 🎯' : 'Raté…'}
          </div>
        )}

        {/* Cooldown */}
        {onCooldown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-red-500/90 px-4 py-1 font-mono text-sm text-white">
              ⏳ {(cooldownLeft / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        {/* HUD zoom */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm">
          <HudBtn onClick={() => zoomBy(1 / 1.3, VIEW_W / 2, VIEW_H / 2)}>−</HudBtn>
          <span className="w-10 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
          <HudBtn onClick={() => zoomBy(1.3, VIEW_W / 2, VIEW_H / 2)}>+</HudBtn>
        </div>
      </div>

      <p className="text-xs text-stone-400">
        {interactive
          ? 'Clique sur une cachette pour démasquer un caché. Un raté impose 3s d’attente. Glisse pour te déplacer, molette pour zoomer.'
          : 'Repère les cachettes possibles. La traque commence bientôt.'}
      </p>
    </div>
  );
}

function HudBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 min-w-8 rounded-md border border-stone-200 bg-white px-2 text-sm hover:border-stone-300"
    >
      {children}
    </button>
  );
}
