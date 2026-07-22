import { useId } from 'react';
import { Users } from 'lucide-react';
import type { HintZone } from './hintZones.js';

/**
 * Overlay d'indice « projecteur » : assombrit le tableau HORS des zones, laissant
 * les zones (cachettes probables) en pleine lumière pour resserrer la recherche.
 * Les cercles qui se chevauchent forment un trou fusionné (jointure naturelle) ;
 * chaque blob de ≥ 2 cachés porte un badge du nombre de personnes qu'il contient.
 * Rendu en coordonnées écran (suit la caméra) ; ne bloque pas les clics.
 */
export function HintOverlay({
  zones,
  camX,
  camY,
  scale,
  dim = 0.62,
}: {
  zones: HintZone[];
  camX: number;
  camY: number;
  scale: number;
  dim?: number;
}): JSX.Element | null {
  const maskId = useId();
  if (zones.length === 0) return null;

  const sx = (ax: number) => camX + ax * scale;
  const sy = (ay: number) => camY + ay * scale;

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
        <defs>
          <mask id={maskId}>
            {/* blanc = zone assombrie ; noir = trou (zone éclairée) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {zones.flatMap((z, zi) =>
              z.circles.map((c, ci) => (
                <circle
                  key={`${zi}-${ci}`}
                  cx={sx(c.cx)}
                  cy={sy(c.cy)}
                  r={c.r * scale}
                  fill="black"
                />
              )),
            )}
          </mask>
        </defs>

        {/* Voile sombre percé aux zones */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="#0b0a12"
          opacity={dim}
          mask={`url(#${maskId})`}
        />

        {/* Anneau doré sur les zones à un seul caché (les blobs joints n'en ont pas,
            leur forme fusionnée suffit à montrer la jointure). */}
        {zones
          .filter((z) => z.count === 1)
          .map((z) => {
            const c = z.circles[0]!;
            return (
              <circle
                key={z.key}
                cx={sx(c.cx)}
                cy={sy(c.cy)}
                r={c.r * scale}
                fill="none"
                stroke="#e0b64a"
                strokeWidth={2}
                strokeDasharray="7 7"
                opacity={0.75}
                className="animate-[spin_18s_linear_infinite]"
                style={{ transformOrigin: `${sx(c.cx)}px ${sy(c.cy)}px` }}
              />
            );
          })}
      </svg>

      {/* Badges du nombre de cachés (blobs fusionnés) */}
      {zones
        .filter((z) => z.count >= 2)
        .map((z) => (
          <div
            key={z.key}
            className="animate-pop-in pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-gold/60 bg-night/85 px-2.5 py-1 text-sm font-bold text-white shadow-pop"
            style={{ left: sx(z.labelX), top: sy(z.labelY) }}
          >
            <Users className="h-4 w-4 text-gold" />
            {z.count}
          </div>
        ))}
    </>
  );
}
