import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Hand,
  Minus,
  PaintBucket,
  Paintbrush,
  Palette,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import {
  CHARACTER_ROTATIONS,
  CHARACTER_SIZE,
  EVENTS,
  type Artwork,
  type CharacterRotation,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useCharacterStore } from '../store/characterStore.js';
import { useCharacterPainting } from './useCharacterPainting.js';
import { PixelSprite } from './PixelSprite.js';
import { artworkBg } from './artworkBg.js';
import { rgbToHex } from './paintOps.js';

const S = CHARACTER_SIZE;
const MOVE_EMIT_MS = 80;
const PRESENCE_MS = 350;

type BoardTool = 'move' | 'brush' | 'bucket' | 'pipette';
interface Camera {
  zoom: number;
  x: number;
  y: number;
}
interface Other {
  pseudo: string;
  x: number;
  y: number;
  rotation: CharacterRotation;
  pixels: number[];
}

const BASE_PALETTE = [
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
const SIZES = [1, 2, 3, 5, 8] as const;

/**
 * Plateau de camouflage plein écran : le tableau remplit tout l'espace
 * disponible (mesuré en continu), les outils vivent dans un panneau vertical à
 * droite. Caméra (zoom/pan), Déplacer, pinceau/pot/pipette ; la pipette
 * échantillonne les vraies couleurs de l'œuvre puis rebascule sur le pinceau.
 * Le dernier état (position + peinture) est relayé en continu au serveur, qui
 * verrouille automatiquement le camouflage à la fin du chrono.
 */
export function CamouflageBoard({ artwork, live = false }: { artwork: Artwork; live?: boolean }) {
  const paint = useCharacterPainting();
  const x = useCharacterStore((s) => s.x);
  const y = useCharacterStore((s) => s.y);
  const rotation = useCharacterStore((s) => s.rotation);
  const pixels = useCharacterStore((s) => s.pixels);
  const tick = useCharacterStore((s) => s.tick);
  const locked = useCharacterStore((s) => s.locked);
  const setPlacement = useCharacterStore((s) => s.setPlacement);

  const wrapRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLCanvasElement>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setToolState] = useState<BoardTool>('move');
  const [space, setSpace] = useState(false);
  const [artColors, setArtColors] = useState<string[]>([]);
  const [others, setOthers] = useState<Record<string, Other>>({});
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [vp, setVp] = useState({ w: 960, h: 640 });

  // Le plateau épouse son conteneur (plein écran, pas de scroll).
  useLayoutEffect(() => {
    const el = wrapRef.current;
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
  const effTool: BoardTool = space ? 'pipette' : tool;

  const drag = useRef<{
    mode: 'pan' | 'character' | 'paint';
    cx: number;
    cy: number;
    sx: number;
    sy: number;
    px: number;
    py: number;
  } | null>(null);
  const lastMove = useRef(0);
  const lastPresence = useRef(0);

  const setTool = (t: BoardTool) => {
    setToolState(t);
    if (t === 'brush' || t === 'bucket' || t === 'pipette') paint.setTool(t);
  };

  // Choisir une couleur (palette / pipette) bascule sur le pinceau : on évite la
  // gymnastique « re-sélectionner l'outil » avant de peindre.
  const pickColor = (c: string) => {
    paint.setColor(c);
    if (tool !== 'brush' && tool !== 'bucket') setTool('brush');
  };

  // Centrage initial du perso à chaque œuvre.
  useEffect(() => {
    setPlacement({
      x: Math.round((artwork.width - S) / 2),
      y: Math.round((artwork.height - S) / 2),
    });
    setOthers({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artwork.id]);

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

  // Redessine le perso.
  useEffect(() => {
    const c = charRef.current;
    if (!c || !pixels) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
  }, [pixels, tick]);

  // Charge l'œuvre pour l'échantillonnage pipette + extraction de palette.
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

  // Présence des autres cachés.
  useEffect(() => {
    if (!live) return;
    const onPresence = (d: Other & { playerId: string }) => {
      setOthers((o) => ({
        ...o,
        [d.playerId]: { pseudo: d.pseudo, x: d.x, y: d.y, rotation: d.rotation, pixels: d.pixels },
      }));
    };
    socket.on(EVENTS.presence, onPresence);
    return () => {
      socket.off(EVENTS.presence, onPresence);
    };
  }, [live]);

  // Raccourcis clavier.
  useEffect(() => {
    if (locked) return;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        e.shiftKey ? paint.redo() : paint.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        paint.redo();
        return;
      }
      if (k === 'v' || k === 'm') setTool('move');
      else if (k === 'b') setTool('brush');
      else if (k === 'g') setTool('bucket');
      else if (k === 'e' || k === 'p') setTool('pipette');
      else if (k === 'r') rotate(1);
      else if (k >= '1' && k <= '5') paint.setBrush(SIZES[+k - 1]!);
      else if (k === '+' || k === '=') zoomBy(1.3, vp.w / 2, vp.h / 2);
      else if (k === '-') zoomBy(1 / 1.3, vp.w / 2, vp.h / 2);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, tool, rotation, x, y, vp.w, vp.h]);

  const capture = (e: React.PointerEvent) => {
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const emitMove = (nx: number, ny: number, rot: CharacterRotation, force = false) => {
    const now = Date.now();
    if (!force && now - lastMove.current < MOVE_EMIT_MS) return;
    lastMove.current = now;
    socket.emit(EVENTS.characterMove, { x: nx, y: ny, rotation: rot });
  };

  const emitPresence = (force = false) => {
    if (!live) return;
    const st = useCharacterStore.getState();
    if (!st.pixels) return;
    const now = Date.now();
    if (!force && now - lastPresence.current < PRESENCE_MS) return;
    lastPresence.current = now;
    socket.emit(EVENTS.presenceUpdate, {
      x: st.x,
      y: st.y,
      rotation: st.rotation,
      pixels: Array.from(st.pixels),
    });
  };

  // Présence initiale dès que le perso est prêt : le serveur connaît ainsi un
  // état à verrouiller en fin de chrono même si le joueur ne touche à rien.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !pixels || announced.current === artwork.id) return;
    announced.current = artwork.id;
    emitPresence(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, pixels, artwork.id]);

  const charPixel = (e: { clientX: number; clientY: number }) => {
    const rect = charRef.current!.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * S);
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * S);
    return { x: Math.max(0, Math.min(S - 1, cx)), y: Math.max(0, Math.min(S - 1, cy)) };
  };

  const sampleAt = (e: { clientX: number; clientY: number }) => {
    const c = sampleRef.current;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!c || !rect) return;
    const ax = (e.clientX - rect.left - cam.x) / scale;
    const ay = (e.clientY - rect.top - cam.y) / scale;
    const px = Math.max(0, Math.min(c.width - 1, Math.round(ax)));
    const py = Math.max(0, Math.min(c.height - 1, Math.round(ay)));
    const d = c.getContext('2d')!.getImageData(px, py, 1, 1).data;
    paint.setColor(rgbToHex(d[0]!, d[1]!, d[2]!));
    // Couleur capturée → pinceau prêt à peindre, même si la pipette venait d'Espace.
    setTool('brush');
  };

  const clampX = (v: number) => Math.max(0, Math.min(artwork.width - S, v));
  const clampY = (v: number) => Math.max(0, Math.min(artwork.height - S, v));

  const onCharDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (locked) return;
    if (effTool === 'pipette') return sampleAt(e);
    if (effTool === 'move') {
      drag.current = {
        mode: 'character',
        cx: e.clientX,
        cy: e.clientY,
        sx: x,
        sy: y,
        px: cam.x,
        py: cam.y,
      };
      capture(e);
      return;
    }
    // pinceau / pot
    paint.setTool(effTool);
    const p = charPixel(e);
    if (paint.pointerDown(p.x, p.y)) {
      drag.current = {
        mode: 'paint',
        cx: e.clientX,
        cy: e.clientY,
        sx: x,
        sy: y,
        px: cam.x,
        py: cam.y,
      };
      capture(e);
    } else {
      emitPresence(true); // pot : coup unique
    }
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (locked && effTool !== 'pipette') return;
    if (effTool === 'pipette') return sampleAt(e);
    drag.current = {
      mode: 'pan',
      cx: e.clientX,
      cy: e.clientY,
      sx: x,
      sy: y,
      px: cam.x,
      py: cam.y,
    };
    capture(e);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    if (d.mode === 'pan') {
      setCam((c) => ({ ...c, x: d.px + dx, y: d.py + dy }));
    } else if (d.mode === 'character') {
      const nx = clampX(Math.round(d.sx + dx / scale));
      const ny = clampY(Math.round(d.sy + dy / scale));
      setPlacement({ x: nx, y: ny });
      emitMove(nx, ny, rotation);
      emitPresence();
    } else {
      const p = charPixel(e);
      paint.pointerMove(p.x, p.y);
      emitPresence();
    }
  };

  const onUp = () => {
    const d = drag.current;
    if (d?.mode === 'paint') {
      paint.pointerUp();
      emitPresence(true);
    } else if (d?.mode === 'character') {
      emitMove(x, y, rotation, true);
      emitPresence(true);
    }
    drag.current = null;
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
  const rotate = (dir: 1 | -1) => {
    if (locked) return;
    const idx = CHARACTER_ROTATIONS.indexOf(useCharacterStore.getState().rotation);
    const next = CHARACTER_ROTATIONS[(idx + dir + 4) % 4]!;
    setPlacement({ rotation: next });
    emitMove(x, y, next, true);
    emitPresence(true);
  };

  const cursor = locked
    ? 'default'
    : effTool === 'pipette'
      ? 'copy'
      : effTool === 'move'
        ? 'grab'
        : 'crosshair';
  const charDisp = S * scale;

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Tableau : toute la place disponible */}
      <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden bg-night-800">
        <div
          ref={viewportRef}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onWheel={onWheel}
          className="absolute inset-0"
          style={{ touchAction: 'none', cursor }}
        >
          {/* Couche œuvre */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: artwork.width * fitScale,
              height: artwork.height * fitScale,
              transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`,
              background: artworkBg(artwork),
            }}
          >
            {/* Autres cachés (présence) */}
            {Object.entries(others).map(([id, o]) => (
              <div
                key={id}
                className="pointer-events-none absolute opacity-70"
                style={{
                  left: o.x * fitScale,
                  top: o.y * fitScale,
                  width: S * fitScale,
                  height: S * fitScale,
                }}
              >
                <PixelSprite pixels={o.pixels} size={S * fitScale} rotation={o.rotation} />
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-1 text-[8px] text-white">
                  {o.pseudo}
                </span>
              </div>
            ))}
          </div>

          {/* Cadre zone peignable */}
          <div
            className="pointer-events-none absolute rounded-sm ring-2 ring-gold/70"
            style={{
              left: cam.x + x * scale,
              top: cam.y + y * scale,
              width: charDisp,
              height: charDisp,
            }}
          />
          {/* Canvas du perso (dans l'espace écran, aligné à la caméra) */}
          <canvas
            ref={charRef}
            width={S}
            height={S}
            onPointerDown={onCharDown}
            className="absolute touch-none"
            style={{
              left: cam.x + x * scale,
              top: cam.y + y * scale,
              width: charDisp,
              height: charDisp,
              imageRendering: 'pixelated',
              transform: `rotate(${rotation}deg)`,
              cursor,
            }}
          />

          {/* HUD zoom */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-surface/90 p-1 shadow-soft">
            <HudBtn onClick={() => zoomBy(1 / 1.3, vp.w / 2, vp.h / 2)}>
              <Minus className="h-4 w-4" />
            </HudBtn>
            <span className="w-9 text-center font-mono text-xs">{cam.zoom.toFixed(1)}×</span>
            <HudBtn onClick={() => zoomBy(1.3, vp.w / 2, vp.h / 2)}>
              <Plus className="h-4 w-4" />
            </HudBtn>
          </div>
          {space && (
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-night/80 px-2 py-1 text-xs text-white">
              <Pipette className="h-3.5 w-3.5" /> Pipette (Espace) — clique sur le tableau
            </div>
          )}
        </div>
      </div>

      <Toolbar
        tool={tool}
        setTool={setTool}
        rotate={rotate}
        color={paint.color}
        setColor={pickColor}
        brush={paint.brush}
        setBrush={paint.setBrush}
        artColors={artColors}
        undo={paint.undo}
        redo={paint.redo}
        clear={paint.clear}
        canUndo={paint.canUndo}
        canRedo={paint.canRedo}
      />
    </div>
  );
}

interface ToolbarProps {
  tool: BoardTool;
  setTool: (t: BoardTool) => void;
  rotate: (d: 1 | -1) => void;
  color: string;
  setColor: (c: string) => void;
  brush: number;
  setBrush: (b: number) => void;
  artColors: string[];
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TOOLS: {
  id: BoardTool;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  key: string;
}[] = [
  { id: 'move', Icon: Hand, label: 'Déplacer', key: 'V' },
  { id: 'brush', Icon: Paintbrush, label: 'Pinceau', key: 'B' },
  { id: 'bucket', Icon: PaintBucket, label: 'Pot', key: 'G' },
  { id: 'pipette', Icon: Pipette, label: 'Pipette', key: 'E / Espace' },
];

/** Panneau d'outils vertical (colonne de droite du plateau plein écran). */
function Toolbar(p: ToolbarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-surface p-4">
      <div>
        <SectionTitle>Outils</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => p.setTool(t.id)}
              title={`${t.label} (${t.key})`}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition ${
                p.tool === t.id
                  ? 'border-accent bg-accent text-white shadow-soft'
                  : 'border-line hover:border-muted/40'
              }`}
            >
              <t.Icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <HudBtn onClick={() => p.rotate(-1)}>
          <RotateCcw className="h-4 w-4" />
        </HudBtn>
        <HudBtn onClick={() => p.rotate(1)}>
          <RotateCw className="h-4 w-4" />
        </HudBtn>
        <span className="ml-auto flex items-center gap-2">
          <span
            className="h-9 w-9 rounded-lg border border-line shadow-soft"
            style={{ background: p.color }}
          />
          <label className="cursor-pointer text-xs text-muted">
            perso
            <input
              type="color"
              value={p.color}
              onChange={(e) => p.setColor(e.target.value)}
              className="sr-only"
            />
          </label>
        </span>
      </div>

      {p.artColors.length > 0 && (
        <div>
          <SectionTitle gold>
            <Palette className="inline h-3.5 w-3.5" /> Couleurs du tableau
          </SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {p.artColors.map((c, i) => (
              <Swatch
                key={i}
                color={c}
                active={p.color.toLowerCase() === c.toLowerCase()}
                ring="gold"
                onClick={() => p.setColor(c)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Palette</SectionTitle>
        <div className="grid grid-cols-6 gap-1.5">
          {BASE_PALETTE.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={p.color.toLowerCase() === c.toLowerCase()}
              ring="accent"
              onClick={() => p.setColor(c)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Taille</SectionTitle>
        <div className="flex items-center gap-1.5">
          {SIZES.map((b, i) => (
            <button
              key={b}
              onClick={() => p.setBrush(b)}
              title={`${b} px (${i + 1})`}
              className={`grid h-9 w-9 place-items-center rounded-xl border transition ${
                p.brush === b ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted/40'
              }`}
            >
              <span
                className="rounded-full bg-ink"
                style={{ width: `${4 + b * 2}px`, height: `${4 + b * 2}px` }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-sm">
        <button
          onClick={p.undo}
          disabled={!p.canUndo}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 transition hover:border-muted/40 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Annuler
        </button>
        <button
          onClick={p.redo}
          disabled={!p.canRedo}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 transition hover:border-muted/40 disabled:opacity-40"
        >
          <Redo2 className="h-3.5 w-3.5" /> Rétablir
        </button>
        <button
          onClick={p.clear}
          className="rounded-lg border border-line px-2.5 py-1.5 text-red-600 transition hover:bg-red-50"
        >
          Réinitialiser
        </button>
      </div>

      <p className="mt-auto text-[11px] leading-relaxed text-muted">
        Raccourcis : Espace = pipette · B/G/E/V = outils · 1-5 = taille · R = rotation · molette =
        zoom
      </p>
    </aside>
  );
}

function SectionTitle({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <div
      className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${
        gold ? 'text-gold' : 'text-muted'
      }`}
    >
      {children}
    </div>
  );
}

function Swatch({
  color,
  active,
  onClick,
  ring,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
  ring: 'gold' | 'accent';
}) {
  return (
    <button
      onClick={onClick}
      aria-label={color}
      className={`h-7 w-7 rounded-md border transition hover:scale-110 ${
        active
          ? `ring-2 ring-offset-1 ${ring === 'gold' ? 'ring-gold' : 'ring-accent'}`
          : 'border-line'
      }`}
      style={{ background: color }}
    />
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
