import { useCallback, useEffect, useRef, useState } from 'react';
import { CHARACTER_SIZE } from '@mimic/shared';
import { loadCharacterBase } from './character.js';
import { useCharacterStore } from '../store/characterStore.js';

const S = CHARACTER_SIZE;
const BRUSH_SIZES = [1, 2, 3, 5, 8] as const;
const PALETTE = [
  '#1c1917',
  '#78716c',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#7c2d12',
  '#166534',
  '#1e3a8a',
  '#fde68a',
];
const MAX_HISTORY = 60;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Éditeur de peinture du personnage (issue #8).
 * Pinceau à taille réglable, peinture limitée à la silhouette (masque alpha),
 * palette, undo/redo. Rendu pixelisé sur fond en damier (zones transparentes).
 */
export function PaintEditor(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<Uint8ClampedArray | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const baseRef = useRef<Uint8ClampedArray | null>(null);
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const paintingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const colorRef = useRef('#1c1917');
  const brushRef = useRef<number>(3);

  const [ready, setReady] = useState(false);
  const [color, setColor] = useState('#1c1917');
  const [brush, setBrush] = useState(3);
  const [, forceTick] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const px = pixelsRef.current;
    if (!canvas || !px) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
  }, []);

  // Chargement de la silhouette (une fois si le store n'est pas déjà amorcé).
  useEffect(() => {
    const store = useCharacterStore.getState();
    if (store.pixels && store.mask) {
      // Reprise d'un personnage déjà peint (retour depuis l'onglet Placer).
      maskRef.current = store.mask;
      pixelsRef.current = store.pixels;
      if (!baseRef.current) baseRef.current = store.pixels.slice();
      setReady(true);
      redraw();
      return;
    }
    let alive = true;
    loadCharacterBase()
      .then(({ mask, pixels }) => {
        if (!alive) return;
        maskRef.current = mask;
        baseRef.current = pixels.slice();
        pixelsRef.current = pixels;
        useCharacterStore.getState().setBase(mask, pixels);
        setReady(true);
        redraw();
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [redraw]);

  const snapshot = useCallback(() => {
    const px = pixelsRef.current;
    if (!px) return;
    historyRef.current.push(px.slice());
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
  }, []);

  const paintAt = useCallback((cx: number, cy: number) => {
    const px = pixelsRef.current;
    const mask = maskRef.current;
    if (!px || !mask) return;
    const [r, g, b] = hexToRgb(colorRef.current);
    const size = brushRef.current;
    const half = Math.floor(size / 2);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = cx - half + dx;
        const y = cy - half + dy;
        if (x < 0 || x >= S || y < 0 || y >= S) continue;
        const idx = y * S + x;
        if (mask[idx] === 0) continue;
        px[idx * 4] = r;
        px[idx * 4 + 1] = g;
        px[idx * 4 + 2] = b;
        px[idx * 4 + 3] = 255;
      }
    }
  }, []);

  // Trace une ligne entre deux points pour éviter les trous en mouvement rapide.
  const paintLine = useCallback(
    (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      if (steps === 0) return paintAt(x1, y1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        paintAt(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
      }
    },
    [paintAt],
  );

  const eventToPixel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * S);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * S);
    return { x: Math.max(0, Math.min(S - 1, x)), y: Math.max(0, Math.min(S - 1, y)) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || useCharacterStore.getState().locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    paintingRef.current = true;
    const p = eventToPixel(e);
    lastRef.current = p;
    paintAt(p.x, p.y);
    redraw();
    forceTick((n) => n + 1);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const p = eventToPixel(e);
    const last = lastRef.current ?? p;
    paintLine(last.x, last.y, p.x, p.y);
    lastRef.current = p;
    redraw();
  };

  const endStroke = () => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastRef.current = null;
    // Notifie le plateau (onglet Placer) que les pixels ont changé.
    useCharacterStore.getState().bump();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    const px = pixelsRef.current;
    if (!prev || !px) return;
    redoRef.current.push(px.slice());
    pixelsRef.current = prev;
    useCharacterStore.getState().setPixels(prev);
    redraw();
    forceTick((n) => n + 1);
  };

  const redo = () => {
    const next = redoRef.current.pop();
    const px = pixelsRef.current;
    if (!next || !px) return;
    historyRef.current.push(px.slice());
    pixelsRef.current = next;
    useCharacterStore.getState().setPixels(next);
    redraw();
    forceTick((n) => n + 1);
  };

  const clear = () => {
    const base = baseRef.current;
    if (!base) return;
    snapshot();
    const fresh = base.slice();
    pixelsRef.current = fresh;
    useCharacterStore.getState().setPixels(fresh);
    redraw();
    forceTick((n) => n + 1);
  };

  const pickColor = (c: string) => {
    setColor(c);
    colorRef.current = c;
  };
  const pickBrush = (b: number) => {
    setBrush(b);
    brushRef.current = b;
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {/* Zone de dessin */}
      <div
        className="shrink-0 self-start rounded-xl border border-stone-200 p-2"
        style={{
          background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #f5f5f4 0% 50%) 50% / 16px 16px',
        }}
      >
        <canvas
          ref={canvasRef}
          width={S}
          height={S}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className="block touch-none"
          style={{
            width: 320,
            height: 320,
            imageRendering: 'pixelated',
            cursor: ready ? 'crosshair' : 'wait',
          }}
        />
      </div>

      {/* Barre d'outils */}
      <div className="flex-1 space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Couleur
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => pickColor(c)}
                aria-label={c}
                className={`h-7 w-7 rounded-md border transition ${
                  color.toLowerCase() === c.toLowerCase()
                    ? 'ring-2 ring-accent ring-offset-1'
                    : 'border-stone-200'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
            <input
              type="color"
              value={color}
              onChange={(e) => pickColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-stone-200 bg-transparent"
            />
            Personnalisée
          </label>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Taille du pinceau
          </div>
          <div className="flex gap-1.5">
            {BRUSH_SIZES.map((b) => (
              <button
                key={b}
                onClick={() => pickBrush(b)}
                className={`h-9 w-9 rounded-md border text-sm font-medium transition ${
                  brush === b
                    ? 'border-accent bg-accent text-white'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={undo}
            disabled={historyRef.current.length === 0}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ↩ Annuler
          </button>
          <button
            onClick={redo}
            disabled={redoRef.current.length === 0}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ↪ Rétablir
          </button>
          <button
            onClick={clear}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Réinitialiser
          </button>
        </div>
      </div>
    </div>
  );
}
