import { useEffect, useRef, useState } from 'react';
import { CHARACTER_SIZE, type Artwork } from '@mimic/shared';
import { useCharacterStore } from '../store/characterStore.js';
import { useCharacterPainting } from './useCharacterPainting.js';
import { PaintToolbar } from './PaintToolbar.js';
import { artworkBg } from './artworkBg.js';
import { rgbToHex } from './paintOps.js';

const S = CHARACTER_SIZE;
const VIEW = 460;
/** Taille d'affichage du personnage (px) → 5 px écran par pixel de perso. */
const CHAR_DISP = 320;
const SCALE = CHAR_DISP / S;

/**
 * Peinture du personnage directement sur le tableau (issue #35 + refonte).
 * Le personnage est centré, l'œuvre visible autour. La pipette échantillonne les
 * VRAIES couleurs du tableau (n'importe où sur le plateau) et une palette est
 * auto-extraite de l'œuvre → on capture les teintes du fond pour s'y fondre.
 */
export function BoardPaintStage({ artwork }: { artwork: Artwork }): JSX.Element {
  const paint = useCharacterPainting();
  const x = useCharacterStore((s) => s.x);
  const y = useCharacterStore((s) => s.y);
  const pixels = useCharacterStore((s) => s.pixels);
  const tick = useCharacterStore((s) => s.tick);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const [artColors, setArtColors] = useState<string[]>([]);

  const originX = VIEW / 2 - (x + S / 2) * SCALE;
  const originY = VIEW / 2 - (y + S / 2) * SCALE;

  // Redessine le personnage.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
  }, [pixels, tick]);

  // Charge l'œuvre dans un canvas hors-écran : échantillonnage pipette + palette.
  useEffect(() => {
    if (!artwork.imageUrl) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      sampleRef.current = c;
      setArtColors(extractPalette(ctx, c.width, c.height));
    };
    img.src = artwork.imageUrl;
    return () => {
      alive = false;
    };
  }, [artwork.imageUrl]);

  /** Couleur du tableau (coordonnées de l'œuvre) sous un point, ou null. */
  const sampleArtwork = (ax: number, ay: number): string | null => {
    const c = sampleRef.current;
    if (!c) return null;
    const px = Math.max(0, Math.min(c.width - 1, Math.round(ax)));
    const py = Math.max(0, Math.min(c.height - 1, Math.round(ay)));
    const d = c.getContext('2d')!.getImageData(px, py, 1, 1).data;
    return rgbToHex(d[0]!, d[1]!, d[2]!);
  };

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

  // Pipette : capture la couleur du tableau n'importe où sur le plateau.
  const onPipette = (e: React.PointerEvent) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const ax = (e.clientX - rect.left - originX) / SCALE;
    const ay = (e.clientY - rect.top - originY) / SCALE;
    const hex = sampleArtwork(ax, ay);
    if (hex) {
      paint.setColor(hex);
      paint.setTool('brush');
    }
  };

  const isPipette = paint.tool === 'pipette';
  const cursor = !paint.ready ? 'wait' : 'crosshair';

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div
        ref={viewportRef}
        className="relative shrink-0 self-start overflow-hidden rounded-xl2 border border-line bg-night-800 shadow-frame"
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
          className="pointer-events-none absolute rounded-sm ring-2 ring-gold/70"
          style={{
            left: originX + x * SCALE,
            top: originY + y * SCALE,
            width: CHAR_DISP,
            height: CHAR_DISP,
            boxShadow: '0 0 0 9999px rgba(15,12,20,0.35)',
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
        {/* Surcouche pipette : capte les clics sur tout le plateau */}
        {isPipette && (
          <div
            onPointerDown={onPipette}
            className="absolute inset-0 z-10"
            style={{ cursor: 'copy' }}
          />
        )}
        {/* Indice pipette */}
        {isPipette && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-night/80 px-3 py-1.5 text-center text-xs font-medium text-white">
            💧 Clique sur le tableau pour capturer sa couleur
          </div>
        )}
      </div>

      <PaintToolbar paint={paint} artworkColors={artColors} />
    </div>
  );
}

/** Extrait ~10 couleurs représentatives d'une œuvre (buckets 5 bits, par fréquence). */
function extractPalette(ctx: CanvasRenderingContext2D, w: number, h: number): string[] {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 48));
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const i = (py * w + px) * 4;
      if (data[i + 3]! < 128) continue;
      const key = ((data[i]! >> 5) << 10) | ((data[i + 1]! >> 5) << 5) | (data[i + 2]! >> 5);
      const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      b.r += data[i]!;
      b.g += data[i + 1]!;
      b.b += data[i + 2]!;
      b.n++;
      buckets.set(key, b);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .map((b) => rgbToHex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)))
    .sort((a, b) => parseInt(a.slice(1), 16) - parseInt(b.slice(1), 16));
}
