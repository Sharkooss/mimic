import { useEffect, useRef } from 'react';
import { CHARACTER_SIZE } from '@mimic/shared';
import { useCharacterStore } from '../store/characterStore.js';

const S = CHARACTER_SIZE;

/**
 * Rend le personnage peint (pixels du store) sur un canvas pixelisé.
 * Se redessine quand les pixels changent (`tick`). La taille d'affichage et la
 * rotation sont pilotées par le parent (via CSS transform).
 */
export function CharacterSprite({
  size,
  rotation = 0,
  className,
}: {
  size: number;
  rotation?: number;
  className?: string;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixels = useCharacterStore((s) => s.pixels);
  const tick = useCharacterStore((s) => s.tick);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
  }, [pixels, tick]);

  return (
    <canvas
      ref={canvasRef}
      width={S}
      height={S}
      className={className}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        transform: `rotate(${rotation}deg)`,
      }}
    />
  );
}
