import { CHARACTER_SIZE, type Artwork, type RoundReveal } from '@mimic/shared';
import { PixelSprite } from './PixelSprite.js';
import { artworkBg } from './artworkBg.js';

const S = CHARACTER_SIZE;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Carte « focus » : gros plan zoomé de l'œuvre centré sur la cachette d'un
 * joueur, avec son personnage peint dessus, un anneau (vert = échappé / rouge =
 * repéré) et un pied de carte (pseudo, sort, score de camouflage). Sert au récap
 * de fin de manche : une carte par joueur pour voir où chacun se cachait.
 */
export function ArtworkFocus({
  artwork,
  reveal,
  size = 168,
  index = 0,
}: {
  artwork: Artwork;
  reveal: RoundReveal;
  size?: number;
  index?: number;
}): JSX.Element {
  const win = S * 2.3; // fenêtre de l'œuvre montrée (px œuvre) → contexte autour du perso
  const zoom = size / win;
  const bgW = artwork.width * zoom;
  const bgH = artwork.height * zoom;
  const cx = reveal.x + S / 2;
  const cy = reveal.y + S / 2;
  // Décalage pour centrer le perso, borné pour que l'œuvre couvre toujours la carte.
  const offX = clamp(size / 2 - cx * zoom, size - bgW, 0);
  const offY = clamp(size / 2 - cy * zoom, size - bgH, 0);

  return (
    <figure
      className="animate-pop-in overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0"
          style={{
            background: artwork.imageUrl
              ? `no-repeat url("${artwork.imageUrl}")`
              : artworkBg(artwork),
            backgroundSize: `${bgW}px ${bgH}px`,
            backgroundPosition: `${offX}px ${offY}px`,
          }}
        />
        {/* Personnage à sa cachette */}
        <div
          className="absolute"
          style={{ left: reveal.x * zoom + offX, top: reveal.y * zoom + offY }}
        >
          <PixelSprite
            pixels={reveal.pixels}
            size={S * zoom}
            rotation={reveal.rotation}
            className={`rounded-sm ring-2 ${reveal.found ? 'ring-red-400' : 'ring-emerald-400'}`}
          />
        </div>
        {/* Pastille de statut */}
        <span
          className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-soft ${
            reveal.found ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        >
          {reveal.found ? 'repéré' : 'échappé'}
        </span>
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="min-w-0 truncate text-sm font-semibold">{reveal.pseudo}</span>
        {reveal.camouflageScore != null && (
          <span className="shrink-0 font-mono text-xs text-gold">🎨 {reveal.camouflageScore}%</span>
        )}
      </figcaption>
    </figure>
  );
}
