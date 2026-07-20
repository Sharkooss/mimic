import { useEffect, useRef, useState } from 'react';
import { loadCharacterBase } from './character.js';
import { useCharacterStore } from '../store/characterStore.js';
import { floodFill, paintLine, paintStamp, pickColorAt } from './paintOps.js';

const MAX_HISTORY = 60;

export type Tool = 'brush' | 'bucket' | 'pipette';

/**
 * Logique de peinture du personnage, indépendante de la présentation.
 * La source de vérité des pixels est le store (`characterStore`) : les composants
 * qui affichent le personnage se redessinent via `pixels` + `tick`. Les handlers
 * reçoivent des coordonnées en pixels de personnage (0..S-1).
 */
export interface CharacterPainting {
  ready: boolean;
  tool: Tool;
  color: string;
  brush: number;
  canUndo: boolean;
  canRedo: boolean;
  setTool: (t: Tool) => void;
  setColor: (c: string) => void;
  setBrush: (b: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  /** Début d'action au pixel (cx,cy). Retourne true si le pointeur doit être capturé (pinceau). */
  pointerDown: (cx: number, cy: number) => boolean;
  pointerMove: (cx: number, cy: number) => void;
  pointerUp: () => void;
}

export function useCharacterPainting(): CharacterPainting {
  const pixelsRef = useRef<Uint8ClampedArray | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const baseRef = useRef<Uint8ClampedArray | null>(null);
  const historyRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const paintingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const colorRef = useRef('#1c1917');
  const brushRef = useRef(3);
  const toolRef = useRef<Tool>('brush');

  const [ready, setReady] = useState(false);
  const [tool, setToolState] = useState<Tool>('brush');
  const [color, setColorState] = useState('#1c1917');
  const [brush, setBrushState] = useState(3);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // Récupère le personnage courant depuis le store, ou charge la silhouette de base.
  useEffect(() => {
    const store = useCharacterStore.getState();
    if (store.pixels && store.mask) {
      maskRef.current = store.mask;
      pixelsRef.current = store.pixels;
      if (!baseRef.current) baseRef.current = store.pixels.slice();
      setReady(true);
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
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, []);

  const snapshot = () => {
    const px = pixelsRef.current;
    if (!px) return;
    historyRef.current.push(px.slice());
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
  };

  const setTool = (t: Tool) => {
    toolRef.current = t;
    setToolState(t);
  };
  const setColor = (c: string) => {
    colorRef.current = c;
    setColorState(c);
  };
  const setBrush = (b: number) => {
    brushRef.current = b;
    setBrushState(b);
  };

  const pointerDown = (cx: number, cy: number): boolean => {
    if (!ready || useCharacterStore.getState().locked) return false;
    const px = pixelsRef.current;
    const mask = maskRef.current;
    if (!px || !mask) return false;

    if (toolRef.current === 'pipette') {
      const hex = pickColorAt(px, cx, cy);
      if (hex) {
        setColor(hex);
        setTool('brush');
      }
      return false;
    }
    if (toolRef.current === 'bucket') {
      snapshot();
      floodFill(px, mask, cx, cy, colorRef.current);
      useCharacterStore.getState().bump();
      rerender();
      return false;
    }
    // pinceau
    snapshot();
    paintingRef.current = true;
    lastRef.current = { x: cx, y: cy };
    paintStamp(px, mask, cx, cy, brushRef.current, colorRef.current);
    useCharacterStore.getState().bump();
    rerender();
    return true;
  };

  const pointerMove = (cx: number, cy: number) => {
    if (!paintingRef.current) return;
    const px = pixelsRef.current;
    const mask = maskRef.current;
    if (!px || !mask) return;
    const last = lastRef.current ?? { x: cx, y: cy };
    paintLine(px, mask, last.x, last.y, cx, cy, brushRef.current, colorRef.current);
    lastRef.current = { x: cx, y: cy };
    useCharacterStore.getState().bump();
  };

  const pointerUp = () => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastRef.current = null;
    useCharacterStore.getState().bump();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    const px = pixelsRef.current;
    if (!prev || !px) return;
    redoRef.current.push(px.slice());
    pixelsRef.current = prev;
    useCharacterStore.getState().setPixels(prev);
    rerender();
  };

  const redo = () => {
    const next = redoRef.current.pop();
    const px = pixelsRef.current;
    if (!next || !px) return;
    historyRef.current.push(px.slice());
    pixelsRef.current = next;
    useCharacterStore.getState().setPixels(next);
    rerender();
  };

  const clear = () => {
    const base = baseRef.current;
    if (!base) return;
    snapshot();
    const fresh = base.slice();
    pixelsRef.current = fresh;
    useCharacterStore.getState().setPixels(fresh);
    rerender();
  };

  return {
    ready,
    tool,
    color,
    brush,
    canUndo: historyRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    setTool,
    setColor,
    setBrush,
    undo,
    redo,
    clear,
    pointerDown,
    pointerMove,
    pointerUp,
  };
}
