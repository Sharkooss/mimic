import { ScanSearch } from 'lucide-react';
import { CHARACTER_SIZE, type Artwork, type RoundReveal } from '@mimic/shared';
import { PixelSprite } from './PixelSprite.js';
import { artworkBg } from './artworkBg.js';
import { ArtworkFocus } from './ArtworkFocus.js';

const S = CHARACTER_SIZE;
const VIEW_W = 560;
const VIEW_H = 380;

/**
 * Récap de fin de manche (#15, refonte) : une vue d'ensemble de l'œuvre avec tous
 * les cachés révélés à leur position, puis une grille de cartes « focus » (gros
 * plan) — une par joueur — pour voir précisément où chacun s'était caché.
 */
export function ResultsStage({
  artwork,
  reveals,
}: {
  artwork: Artwork;
  reveals: RoundReveal[];
}): JSX.Element {
  const fit = Math.min(VIEW_W / artwork.width, VIEW_H / artwork.height);
  const boardW = artwork.width * fit;
  const boardH = artwork.height * fit;
  const found = reveals.filter((r) => r.found).length;

  return (
    <div className="space-y-5">
      {/* Vue d'ensemble */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative overflow-hidden rounded-xl border border-stone-300 shadow-frame"
          style={{ width: boardW, height: boardH, background: artworkBg(artwork) }}
        >
          {!artwork.imageUrl && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/40">
              <span className="text-2xl font-semibold">{artwork.title}</span>
            </div>
          )}
          {reveals.map((r, i) => (
            <div
              key={r.playerId}
              className="animate-pop-in absolute"
              style={{
                left: r.x * fit,
                top: r.y * fit,
                width: S * fit,
                height: S * fit,
                animationDelay: `${i * 120}ms`,
              }}
            >
              <span
                className={`animate-pulse-ring absolute left-1/2 top-1/2 rounded-full border-2 ${
                  r.found ? 'border-red-400' : 'border-emerald-400'
                }`}
                style={{ width: S * fit, height: S * fit, animationDelay: `${i * 120 + 200}ms` }}
              />
              <PixelSprite
                pixels={r.pixels}
                size={S * fit}
                rotation={r.rotation}
                className={`rounded-sm ring-2 ${r.found ? 'ring-red-400' : 'ring-emerald-400'}`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          {artwork.title} · {artwork.author} — {found}/{reveals.length} repéré
          {found > 1 ? 's' : ''}
        </p>
      </div>

      {/* Cartes focus : où était caché chaque joueur */}
      {reveals.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
            <ScanSearch className="h-4 w-4" /> Les cachettes
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {reveals.map((r, i) => (
              <ArtworkFocus key={r.playerId} artwork={artwork} reveal={r} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
