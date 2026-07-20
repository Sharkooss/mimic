import { placeholderCss, type Artwork } from '@mimic/shared';

/**
 * Valeur CSS `background` d'une œuvre : l'image réelle si disponible (#17),
 * sinon le placeholder déterministe (atelier / œuvres sans image).
 */
export function artworkBg(artwork: Artwork): string {
  return artwork.imageUrl
    ? `center / cover no-repeat url("${artwork.imageUrl}")`
    : placeholderCss(artwork.id);
}
