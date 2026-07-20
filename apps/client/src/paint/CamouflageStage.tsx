import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_SIZE,
  CHARACTER_ROTATIONS,
  EVENTS,
  type Artwork,
  type CharacterRotation,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useCharacterStore } from '../store/characterStore.js';
import { CharacterSprite } from './CharacterSprite.js';

const S = CHARACTER_SIZE;
const VIEW_W = 640;
const VIEW_H = 400;
const EMIT_INTERVAL_MS = 80;

/** Fond déterministe pour l'œuvre (placeholder tant que les vraies images ne sont pas là — #17). */
function placeholderBg(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40) % 360;
  return `linear-gradient(135deg, hsl(${a} 45% 62%), hsl(${b} 40% 42%))`;
}

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Plateau de camouflage (issue #11).
 * Affiche l'œuvre (placeholder), permet de déplacer/tourner le personnage et de
 * piloter la caméra (zoom/pan). Émet `character:move` (throttlé) au serveur.
 */
export function CamouflageStage({ artwork }: { artwork: Artwork }): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useCharacterStore((s) => s.x);
  const y = useCharacterStore((s) => s.y);
  const rotation = useCharacterStore((s) => s.rotation);
  const setPlacement = useCharacterStore((s) => s.setPlacement);

  const fitScale = useMemo(
    () => Math.min(VIEW_W / artwork.width, VIEW_H / artwork.height),
    [artwork.width, artwork.height],
  );

  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const scale = fitScale * cam.zoom;

  const drag = useRef<{
    mode: 'pan' | 'character';
    cx: number;
    cy: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const lastEmit = useRef(0);

  // Centrage initial du personnage + de la caméra.
  useEffect(() => {
    setPlacement({
      x: Math.round((artwork.width - S) / 2),
      y: Math.round((artwork.height - S) / 2),
    });
    setCam({
      zoom: 1,
      x: (VIEW_W - artwork.width * fitScale) / 2,
      y: (VIEW_H - artwork.height * fitScale) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artwork.id]);

  const emitMove = (nx: number, ny: number, rot: CharacterRotation, force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit.current < EMIT_INTERVAL_MS) return;
    lastEmit.current = now;
    socket.emit(EVENTS.characterMove, { x: nx, y: ny, rotation: rot });
  };

  const clampX = (v: number) => Math.max(0, Math.min(artwork.width - S, v));
  const clampY = (v: number) => Math.max(0, Math.min(artwork.height - S, v));

  const capture = (e: React.PointerEvent) => {
    // La capture garde le pointeur même s'il sort du viewport ; on ne doit jamais
    // laisser son échec (pointeur synthétique, etc.) interrompre le drag.
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onCharacterPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = {
      mode: 'character',
      cx: e.clientX,
      cy: e.clientY,
      startX: x,
      startY: y,
      startPanX: cam.x,
      startPanY: cam.y,
    };
    capture(e);
  };

  const onViewportPointerDown = (e: React.PointerEvent) => {
    drag.current = {
      mode: 'pan',
      cx: e.clientX,
      cy: e.clientY,
      startX: x,
      startY: y,
      startPanX: cam.x,
      startPanY: cam.y,
    };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    if (d.mode === 'pan') {
      setCam((c) => ({ ...c, x: d.startPanX + dx, y: d.startPanY + dy }));
    } else {
      const nx = clampX(Math.round(d.startX + dx / scale));
      const ny = clampY(Math.round(d.startY + dy / scale));
      setPlacement({ x: nx, y: ny });
      emitMove(nx, ny, rotation);
    }
  };

  const onPointerUp = () => {
    if (drag.current?.mode === 'character') emitMove(x, y, rotation, true);
    drag.current = null;
  };

  /** Zoom multiplicatif autour d'un point (px,py) relatif au viewport. État caméra atomique. */
  const zoomBy = (factor: number, px: number, py: number) => {
    setCam((c) => {
      const z = Math.max(1, Math.min(artwork.maxZoom, c.zoom * factor));
      const s0 = fitScale * c.zoom;
      const s1 = fitScale * z;
      if (s0 === 0) return c;
      return {
        zoom: z,
        x: px - ((px - c.x) * s1) / s0,
        y: py - ((py - c.y) * s1) / s0,
      };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  };

  const rotate = (dir: 1 | -1) => {
    const idx = CHARACTER_ROTATIONS.indexOf(rotation);
    const next = CHARACTER_ROTATIONS[(idx + dir + 4) % 4]!;
    setPlacement({ rotation: next });
    emitMove(x, y, next, true);
  };

  const centerOnCharacter = () => {
    setCam((c) => {
      const s = fitScale * c.zoom;
      return { ...c, x: VIEW_W / 2 - (x + S / 2) * s, y: VIEW_H / 2 - (y + S / 2) * s };
    });
  };

  return (
    <div className="space-y-3">
      <div
        ref={viewportRef}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="relative overflow-hidden rounded-xl border border-stone-300 bg-stone-100"
        style={{ width: VIEW_W, height: VIEW_H, touchAction: 'none', cursor: 'grab' }}
      >
        {/* Couche œuvre (placeholder) */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: artwork.width * fitScale,
            height: artwork.height * fitScale,
            transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`,
            background: placeholderBg(artwork.id),
          }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/40">
            <span className="text-2xl font-semibold">{artwork.title}</span>
          </div>
          {/* Personnage placé */}
          <div
            onPointerDown={onCharacterPointerDown}
            className="absolute cursor-move"
            style={{
              left: x * fitScale,
              top: y * fitScale,
              width: S * fitScale,
              height: S * fitScale,
            }}
          >
            <CharacterSprite
              size={S * fitScale}
              rotation={rotation}
              className="ring-1 ring-white/50"
            />
          </div>
        </div>

        {/* HUD zoom */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm">
          <HudBtn onClick={() => zoomBy(1 / 1.3, VIEW_W / 2, VIEW_H / 2)}>−</HudBtn>
          <span className="w-10 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
          <HudBtn onClick={() => zoomBy(1.3, VIEW_W / 2, VIEW_H / 2)}>+</HudBtn>
        </div>
      </div>

      {/* Contrôles personnage */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-500">Personnage :</span>
        <HudBtn onClick={() => rotate(-1)}>⟲ 90°</HudBtn>
        <HudBtn onClick={() => rotate(1)}>⟳ 90°</HudBtn>
        <button
          onClick={centerOnCharacter}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:border-stone-300"
        >
          Recentrer la caméra
        </button>
        <span className="ml-auto font-mono text-xs text-stone-400">
          x{x} y{y} · {rotation}°
        </span>
      </div>
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
