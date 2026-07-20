import { useEffect, useRef } from 'react';
import { CHARACTER_SIZE, type Artwork } from '@mimic/shared';
import { useCharacterStore } from '../store/characterStore.js';
import { useCharacterPainting } from './useCharacterPainting.js';
import { PaintToolbar } from './PaintToolbar.js';
import { artworkBg } from './artworkBg.js';

const S = CHARACTER_SIZE;
const VIEW = 460;
/** Taille d'affichage du personnage (px) → 5 px écran par pixel de perso. */
const CHAR_DISP = 320;
const SCALE = CHAR_DISP / S;

/**
 * Peinture du personnage directement sur le tableau (issue #35).
 * Le personnage est affiché à sa position, centré dans le viewport, avec le fond
 * de l'œuvre visible tout autour : on peint pour se fondre dans l'environnement
 * réel. Les parties non peintes (hors silhouette) laissent voir l'œuvre derrière.
 */
export function BoardPaintStage({ artwork }: { artwork: Artwork }): JSX.Element {
  const paint = useCharacterPainting();
  const x = useCharacterStore((s) => s.x);
  const y = useCharacterStore((s) => s.y);
  const pixels = useCharacterStore((s) => s.pixels);
  const tick = useCharacterStore((s) => s.tick);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Décalage du fond pour que l'empreinte du perso soit centrée dans le viewport.
  const originX = VIEW / 2 - (x + S / 2) * SCALE;
  const originY = VIEW / 2 - (y + S / 2) * SCALE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
  }, [pixels, tick]);

  const toPixel = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * S);
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * S);
    return { x: Math.max(0, Math.min(S - 1, cx)), y: Math.max(0, Math.min(S - 1, cy)) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toPixel(e);
    if (paint.pointerDown(p.x, p.y)) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toPixel(e);
    paint.pointerMove(p.x, p.y);
  };

  const cursor = !paint.ready ? 'wait' : paint.tool === 'pipette' ? 'copy' : 'crosshair';

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div
        className="relative shrink-0 self-start overflow-hidden rounded-xl border border-stone-300 bg-stone-200"
        style={{ width: VIEW, height: VIEW }}
      >
        {/* Fond de l'œuvre, aligné aux coordonnées du tableau */}
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: artwork.width * SCALE,
            height: artwork.height * SCALE,
            transform: `translate(${originX}px, ${originY}px)`,
            background: artworkBg(artwork),
          }}
        />
        {/* Cadre de la zone peignable (empreinte du personnage) */}
        <div
          className="pointer-events-none absolute rounded-sm ring-1 ring-white/70"
          style={{
            left: originX + x * SCALE,
            top: originY + y * SCALE,
            width: CHAR_DISP,
            height: CHAR_DISP,
          }}
        />
        {/* Canvas du personnage (transparent → laisse voir l'œuvre derrière) */}
        <canvas
          ref={canvasRef}
          width={S}
          height={S}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={paint.pointerUp}
          onPointerLeave={paint.pointerUp}
          className="absolute touch-none"
          style={{
            left: originX + x * SCALE,
            top: originY + y * SCALE,
            width: CHAR_DISP,
            height: CHAR_DISP,
            imageRendering: 'pixelated',
            cursor,
          }}
        />
      </div>

      <PaintToolbar paint={paint} />
    </div>
  );
}
