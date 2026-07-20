import { CHARACTER_SIZE, placeholderCss, type Artwork, type RoundReveal } from '@mimic/shared';
import { PixelSprite } from './PixelSprite.js';

const S = CHARACTER_SIZE;
const VIEW_W = 640;
const VIEW_H = 400;

/**
 * Plateau de résultats (issue #15) : l'œuvre entière avec tous les cachés révélés
 * à leur position finale. Anneau rouge = trouvé, vert = échappé. Vue statique.
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

  return (
    <div className="pt-5">
      <div
        className="relative rounded-xl border border-stone-300"
        style={{ width: boardW, height: boardH, background: placeholderCss(artwork.id) }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/40">
          <span className="text-2xl font-semibold">{artwork.title}</span>
        </div>
        {reveals.map((r) => (
          <div
            key={r.playerId}
            className="absolute"
            style={{ left: r.x * fit, top: r.y * fit, width: S * fit, height: S * fit }}
          >
            <PixelSprite
              pixels={r.pixels}
              size={S * fit}
              rotation={r.rotation}
              className={`rounded-sm ring-2 ${r.found ? 'ring-red-400' : 'ring-emerald-400'}`}
            />
            <span
              className={`absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
                r.found ? 'bg-red-500' : 'bg-emerald-500'
              }`}
            >
              {r.pseudo}
              {r.camouflageScore != null ? ` · ${r.camouflageScore}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
