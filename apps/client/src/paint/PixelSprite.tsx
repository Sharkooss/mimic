import { useEffect, useRef } from 'react';
import { CHARACTER_SIZE } from '@mimic/shared';

const S = CHARACTER_SIZE;

/**
 * Rend un personnage à partir de pixels RGBA fournis (canvas pixelisé).
 * Sert à afficher les cachés révélés (pixels reçus du serveur), là où
 * CharacterSprite lit le personnage du joueur local dans le store.
 */
export function PixelSprite({
  pixels,
  size,
  rotation = 0,
  className,
}: {
  pixels: Uint8ClampedArray | number[] | null;
  size: number;
  rotation?: number;
  className?: string;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    img.data.set(pixels instanceof Uint8ClampedArray ? pixels : Uint8ClampedArray.from(pixels));
    ctx.putImageData(img, 0, 0);
  }, [pixels]);

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
